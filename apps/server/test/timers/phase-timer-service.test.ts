import { describe, expect, it } from 'vitest';
import { createTestDeps } from '../helpers/test-deps.js';
import { buildRepos, collectingLogger, FailingKeyValueStore } from '../helpers/persistence.js';
import { buildTimerHarness, setupRoomViaActor, startGameViaActor, ackAllRevealsViaActor, hostDispatch, playerDispatch, driveViaTimersUntil } from '../helpers/timers.js';
import { KeyValueRoomStateRepository } from '../../src/persistence/room-state-repo.js';
import { roomStateKey } from '../../src/persistence/keys.js';
import { createDefaultConfig } from '../../src/config/defaults.js';

/**
 * Deterministic Development Step 5 tests: every timer here is driven through `FakeTimerScheduler`
 * (`advanceTo()`/`fireNow()`/direct `fireExpiry()` calls) — no real waiting time anywhere in this
 * file. `RealTimerScheduler`'s own wiring is proven separately in `real-timer-scheduler.test.ts`
 * with short real waits, per ARCHITECTURE.md's "real setTimeout in production only" rule.
 *
 * Every room here is driven through `RoomActor`/`RoomActorManager` (`test/helpers/timers.ts`), not
 * the pure-FSM helpers in `test/helpers/room.ts` — only actor-mediated mutations fire the
 * `onMutated` lifecycle hook that keeps `PhaseTimerService` in sync, exactly like production.
 */
describe('PhaseTimerService', () => {
  it('1. a timed phase schedules exactly one timer', async () => {
    const deps = createTestDeps(401);
    const harness = buildTimerHarness(deps, buildRepos(deps));
    const setup = await setupRoomViaActor(harness, 5);

    await startGameViaActor(harness, setup.roomId); // LOBBY -> ... -> ROLE_REVEAL (timed)

    const room = harness.manager.get(setup.roomId).getSnapshot()!.room;
    expect(room.phase.state).toBe('ROLE_REVEAL');
    expect(room.phase.durationMs).not.toBeNull();
    expect(harness.scheduler.size()).toBe(1);
    expect(harness.scheduler.getScheduled(setup.roomId)).toEqual({
      roomId: setup.roomId,
      phaseId: room.phase.phaseId,
      deadline: room.phase.phaseStartedAt + room.phase.durationMs!,
    });
  });

  it('2. a host-paced phase (durationMs null) schedules no timer', async () => {
    const deps = createTestDeps(403);
    const harness = buildTimerHarness(deps, buildRepos(deps));
    const setup = await setupRoomViaActor(harness, 5); // stays in LOBBY — host-paced

    const room = harness.manager.get(setup.roomId).getSnapshot()!.room;
    expect(room.phase.state).toBe('LOBBY');
    expect(room.phase.durationMs).toBeNull();
    expect(harness.scheduler.getScheduled(setup.roomId)).toBeNull();
  });

  it('3 & 4. timer expiry dispatches timer:expired through RoomActor and the result is persisted', async () => {
    const deps = createTestDeps(405);
    const repos = buildRepos(deps);
    const harness = buildTimerHarness(deps, repos);
    const setup = await setupRoomViaActor(harness, 5);
    await startGameViaActor(harness, setup.roomId); // -> ROLE_REVEAL

    const scheduled = harness.scheduler.getScheduled(setup.roomId)!;
    await harness.scheduler.advanceTo(scheduled.deadline);

    const room = harness.manager.get(setup.roomId).getSnapshot()!.room;
    expect(room.phase.state).toBe('GAME_INTRO'); // ROLE_REVEAL's timer:expired handler always exits to GAME_INTRO
    expect(room.phase.phaseId).not.toBe(scheduled.phaseId);

    const persisted = await repos.roomStateRepo.load(setup.roomId);
    expect(persisted?.phase.state).toBe('GAME_INTRO');
    expect(persisted?.stateVersion).toBe(room.stateVersion);
  });

  it('5. a timer-driven transition broadcasts updated views via the onRoomMutated boundary', async () => {
    const deps = createTestDeps(407);
    const harness = buildTimerHarness(deps, buildRepos(deps));
    const setup = await setupRoomViaActor(harness, 5);
    await startGameViaActor(harness, setup.roomId);

    expect(harness.mutatedRooms).not.toContain(setup.roomId); // nothing broadcast by the timer subsystem yet

    const scheduled = harness.scheduler.getScheduled(setup.roomId)!;
    await harness.scheduler.advanceTo(scheduled.deadline);

    expect(harness.mutatedRooms).toContain(setup.roomId);
  });

  it('6. the old phase timer is cancelled and replaced after a phase change', async () => {
    const deps = createTestDeps(409);
    const harness = buildTimerHarness(deps, buildRepos(deps));
    const setup = await setupRoomViaActor(harness, 5);
    await startGameViaActor(harness, setup.roomId); // ROLE_REVEAL
    await harness.scheduler.advanceTo(harness.scheduler.getScheduled(setup.roomId)!.deadline); // -> GAME_INTRO

    const gameIntroScheduled = harness.scheduler.getScheduled(setup.roomId)!;
    expect(harness.manager.get(setup.roomId).getSnapshot()!.room.phase.state).toBe('GAME_INTRO');

    await hostDispatch(harness, setup.roomId, 'host:skipIntro'); // GAME_INTRO -> MINIGAME_SELECT (the Admin's real, timed selection window)

    const room = harness.manager.get(setup.roomId).getSnapshot()!.room;
    expect(room.phase.state).toBe('MINIGAME_SELECT');
    const afterSkipScheduled = harness.scheduler.getScheduled(setup.roomId);
    expect(afterSkipScheduled).not.toBeNull();
    expect(afterSkipScheduled!.phaseId).not.toBe(gameIntroScheduled.phaseId);
    expect(afterSkipScheduled!.phaseId).toBe(room.phase.phaseId);
    expect(harness.scheduler.size()).toBe(1); // never more than one timer for this room
  });

  it('7. a stale phaseId timer callback does nothing', async () => {
    const deps = createTestDeps(411);
    const repos = buildRepos(deps);
    const harness = buildTimerHarness(deps, repos);
    const setup = await setupRoomViaActor(harness, 5);
    await startGameViaActor(harness, setup.roomId); // ROLE_REVEAL
    const staleTimer = harness.scheduler.getScheduled(setup.roomId)!;

    // The room moves on via a completely different path (a host action), leaving `staleTimer` stale.
    await hostDispatch(harness, setup.roomId, 'host:skipRevealTimer'); // -> GAME_INTRO
    const roomAfterSkip = harness.manager.get(setup.roomId).getSnapshot()!.room;
    const mutatedCountAfterSkip = harness.mutatedRooms.length;

    // Re-inject the original (now-stale) timer as if it had just arrived late, and let it fire.
    harness.scheduler.schedule(setup.roomId, staleTimer.phaseId, staleTimer.deadline);
    await harness.scheduler.advanceTo(staleTimer.deadline);

    const roomAfter = harness.manager.get(setup.roomId).getSnapshot()!.room;
    expect(roomAfter.phase.state).toBe(roomAfterSkip.phase.state);
    expect(roomAfter.stateVersion).toBe(roomAfterSkip.stateVersion); // no further mutation happened
    expect(harness.mutatedRooms.length).toBe(mutatedCountAfterSkip); // no extra broadcast
    const persisted = await repos.roomStateRepo.load(setup.roomId);
    expect(persisted?.stateVersion).toBe(roomAfterSkip.stateVersion);
  });

  it('8. a duplicate timer callback for the same (roomId, phaseId) does not transition twice', async () => {
    const deps = createTestDeps(413);
    const harness = buildTimerHarness(deps, buildRepos(deps));
    const setup = await setupRoomViaActor(harness, 5);
    await startGameViaActor(harness, setup.roomId); // ROLE_REVEAL
    const phaseId = harness.manager.get(setup.roomId).getSnapshot()!.room.phase.phaseId;

    await harness.fireExpiry(setup.roomId, phaseId); // legitimate first expiry -> GAME_INTRO
    const afterFirst = harness.manager.get(setup.roomId).getSnapshot()!.room;
    expect(afterFirst.phase.state).toBe('GAME_INTRO');
    const mutatedCountAfterFirst = harness.mutatedRooms.length;

    await harness.fireExpiry(setup.roomId, phaseId); // duplicate/late callback for the SAME original phaseId

    const afterSecond = harness.manager.get(setup.roomId).getSnapshot()!.room;
    expect(afterSecond.phase.state).toBe('GAME_INTRO');
    expect(afterSecond.stateVersion).toBe(afterFirst.stateVersion);
    expect(harness.mutatedRooms.length).toBe(mutatedCountAfterFirst);
  });

  it('9. a host skip before expiry makes the original timer harmless when it later fires', async () => {
    const deps = createTestDeps(415);
    const harness = buildTimerHarness(deps, buildRepos(deps));
    const setup = await setupRoomViaActor(harness, 5);
    await startGameViaActor(harness, setup.roomId); // ROLE_REVEAL
    const roleRevealPhaseId = harness.manager.get(setup.roomId).getSnapshot()!.room.phase.phaseId;

    await hostDispatch(harness, setup.roomId, 'host:skipRevealTimer'); // host skips before the timer would ever fire
    const roomAfterSkip = harness.manager.get(setup.roomId).getSnapshot()!.room;
    expect(roomAfterSkip.phase.state).toBe('GAME_INTRO');

    await harness.fireExpiry(setup.roomId, roleRevealPhaseId); // the original ROLE_REVEAL timer finally "fires"

    const roomAfter = harness.manager.get(setup.roomId).getSnapshot()!.room;
    expect(roomAfter.phase.state).toBe('GAME_INTRO');
    expect(roomAfter.stateVersion).toBe(roomAfterSkip.stateVersion);
  });

  it('10. a player action completing a phase before expiry makes the timer harmless', async () => {
    const deps = createTestDeps(417);
    const harness = buildTimerHarness(deps, buildRepos(deps));
    const setup = await setupRoomViaActor(harness, 5);
    await startGameViaActor(harness, setup.roomId); // ROLE_REVEAL
    const roleRevealPhaseId = harness.manager.get(setup.roomId).getSnapshot()!.room.phase.phaseId;

    await ackAllRevealsViaActor(harness, setup.roomId, setup.playerIds); // every player acks -> GAME_INTRO, before any timer fires
    const roomAfterAck = harness.manager.get(setup.roomId).getSnapshot()!.room;
    expect(roomAfterAck.phase.state).toBe('GAME_INTRO');

    await harness.fireExpiry(setup.roomId, roleRevealPhaseId); // stale ROLE_REVEAL timer arrives late

    const roomAfter = harness.manager.get(setup.roomId).getSnapshot()!.room;
    expect(roomAfter.phase.state).toBe('GAME_INTRO');
    expect(roomAfter.stateVersion).toBe(roomAfterAck.stateVersion);
  });

  it('11. actor recovery schedules only the remaining duration, never resetting to the full duration', async () => {
    let clock = 1_700_000_000_000;
    const deps = { ...createTestDeps(419), now: () => clock };
    const harness = buildTimerHarness(deps, buildRepos(deps));
    const setup = await setupRoomViaActor(harness, 5);
    await startGameViaActor(harness, setup.roomId); // ROLE_REVEAL

    const phase = harness.manager.get(setup.roomId).getSnapshot()!.room.phase;
    expect(phase.durationMs).toBe(15_000);
    const originalDeadline = phase.phaseStartedAt + phase.durationMs!;

    harness.manager.evict(setup.roomId); // drop the in-memory actor AND its timer, like a process restart would
    clock = phase.phaseStartedAt + 10_000; // 10s of the 15s window elapsed — 5s should remain

    await harness.service.recoverRoom(setup.roomId);

    const scheduled = harness.scheduler.getScheduled(setup.roomId);
    expect(scheduled).not.toBeNull();
    expect(scheduled!.phaseId).toBe(phase.phaseId);
    expect(scheduled!.deadline).toBe(originalDeadline); // NOT clock + 15_000 — the absolute deadline never moves
  });

  it('12. an overdue recovered phase dispatches timer:expired immediately instead of being scheduled', async () => {
    let clock = 1_700_100_000_000;
    const deps = { ...createTestDeps(421), now: () => clock };
    const harness = buildTimerHarness(deps, buildRepos(deps));
    const setup = await setupRoomViaActor(harness, 5);
    await startGameViaActor(harness, setup.roomId); // ROLE_REVEAL

    const phase = harness.manager.get(setup.roomId).getSnapshot()!.room.phase;
    const originalDeadline = phase.phaseStartedAt + phase.durationMs!;

    harness.manager.evict(setup.roomId);
    clock = originalDeadline + 5_000; // well past the deadline

    await harness.service.recoverRoom(setup.roomId);

    const room = harness.manager.get(setup.roomId).getSnapshot()!.room;
    expect(room.phase.state).toBe('GAME_INTRO'); // moved on immediately, not left sitting overdue
    expect(room.phase.phaseId).not.toBe(phase.phaseId);
    expect(harness.mutatedRooms).toContain(setup.roomId); // broadcast boundary was still notified
    // The chain continues normally afterward: GAME_INTRO's own timer is scheduled.
    expect(harness.scheduler.getScheduled(setup.roomId)?.phaseId).toBe(room.phase.phaseId);
  });

  it('13. actor recreation via the automatic onActorCreated hook does not create duplicate active timers', async () => {
    const deps = createTestDeps(423);
    const harness = buildTimerHarness(deps, buildRepos(deps));
    const setup = await setupRoomViaActor(harness, 5);
    await startGameViaActor(harness, setup.roomId);
    expect(harness.scheduler.size()).toBe(1);

    harness.manager.evict(setup.roomId);
    expect(harness.scheduler.getScheduled(setup.roomId)).toBeNull();

    harness.manager.get(setup.roomId); // cache miss -> fires onActorCreated -> fire-and-forget recovery
    await new Promise((resolve) => setImmediate(resolve)); // let the fire-and-forget recovery settle

    expect(harness.scheduler.size()).toBe(1);
    const afterFirstRecreate = harness.scheduler.getScheduled(setup.roomId);
    expect(afterFirstRecreate).not.toBeNull();

    harness.manager.get(setup.roomId); // cache HIT — must not fire onActorCreated again
    await new Promise((resolve) => setImmediate(resolve));
    expect(harness.scheduler.size()).toBe(1);
    expect(harness.scheduler.getScheduled(setup.roomId)).toEqual(afterFirstRecreate);
  });

  it('14. two rooms have completely independent timers', async () => {
    const deps = createTestDeps(425);
    const harness = buildTimerHarness(deps, buildRepos(deps));
    const setupA = await setupRoomViaActor(harness, 5);
    await startGameViaActor(harness, setupA.roomId);
    const setupB = await setupRoomViaActor(harness, 5);
    await startGameViaActor(harness, setupB.roomId);

    expect(harness.scheduler.size()).toBe(2);
    const scheduledA = harness.scheduler.getScheduled(setupA.roomId)!;
    const scheduledB = harness.scheduler.getScheduled(setupB.roomId)!;
    expect(scheduledA.roomId).not.toBe(scheduledB.roomId);

    await harness.scheduler.advanceTo(scheduledA.deadline);

    const roomA = harness.manager.get(setupA.roomId).getSnapshot()!.room;
    const roomB = harness.manager.get(setupB.roomId).getSnapshot()!.room;
    expect(roomA.phase.state).toBe('GAME_INTRO'); // A moved on
    expect(roomB.phase.state).toBe('ROLE_REVEAL'); // B completely unaffected
  });

  it('15. explicit actor eviction cancels the room timer', async () => {
    const deps = createTestDeps(427);
    const harness = buildTimerHarness(deps, buildRepos(deps));
    const setup = await setupRoomViaActor(harness, 5);
    await startGameViaActor(harness, setup.roomId);
    expect(harness.scheduler.getScheduled(setup.roomId)).not.toBeNull();

    expect(harness.manager.evict(setup.roomId)).toBe(true);

    expect(harness.scheduler.getScheduled(setup.roomId)).toBeNull();
  });

  it('16. actor recreation restores the timer with the exact same phaseId and deadline', async () => {
    const deps = createTestDeps(429);
    const repos = buildRepos(deps);
    const harness = buildTimerHarness(deps, repos);
    const setup = await setupRoomViaActor(harness, 5);
    await startGameViaActor(harness, setup.roomId);
    const before = harness.scheduler.getScheduled(setup.roomId)!;

    harness.manager.evict(setup.roomId);
    expect(harness.scheduler.getScheduled(setup.roomId)).toBeNull();

    await harness.service.recoverRoom(setup.roomId);

    expect(harness.scheduler.getScheduled(setup.roomId)).toEqual(before);
  });

  it('17. recovering a room whose persisted state has vanished (TTL expiry while evicted) removes/skips the timer without crashing', async () => {
    const deps = createTestDeps(431);
    const repos = buildRepos(deps);
    const { logger, entries } = collectingLogger();
    const harness = buildTimerHarness(deps, repos, { logger });
    const setup = await setupRoomViaActor(harness, 5);
    await startGameViaActor(harness, setup.roomId);

    harness.manager.evict(setup.roomId);
    // Simulate Redis TTL expiry while the actor was evicted — both halves vanish.
    await repos.store.del(roomStateKey(setup.roomId));
    await repos.roomPrivateStateRepo.delete(setup.roomId);

    await expect(harness.service.recoverRoom(setup.roomId)).resolves.toBeUndefined();

    expect(harness.scheduler.getScheduled(setup.roomId)).toBeNull();
    expect(entries.some((e) => e.event === 'timer_recovery_load_failed')).toBe(true);
  });

  it('18. a timer callback can recover an actor purely from the persisted store, not from memory', async () => {
    const deps = createTestDeps(433);
    const repos = buildRepos(deps);
    const harness = buildTimerHarness(deps, repos);
    const setup = await setupRoomViaActor(harness, 5);
    await startGameViaActor(harness, setup.roomId);

    harness.manager.evict(setup.roomId); // now ONLY the store has this room's data — nothing in memory

    const persisted = await repos.roomStateRepo.load(setup.roomId);
    expect(persisted).not.toBeNull();

    await harness.service.recoverRoom(setup.roomId);

    const scheduled = harness.scheduler.getScheduled(setup.roomId);
    expect(scheduled?.phaseId).toBe(persisted!.phase.phaseId);
    expect(scheduled?.deadline).toBe(persisted!.phase.phaseStartedAt + persisted!.phase.durationMs!);
  });

  it('19. a repository read failure during recovery produces a typed (RepositoryError), logged, non-throwing timer error', async () => {
    const deps = createTestDeps(435);
    const repos = buildRepos(deps);
    const { logger, entries } = collectingLogger();
    const harness = buildTimerHarness(deps, repos, { logger });
    const setup = await setupRoomViaActor(harness, 5);
    await startGameViaActor(harness, setup.roomId);
    harness.manager.evict(setup.roomId);

    const failingStore = new FailingKeyValueStore(repos.store);
    failingStore.failGetForKeys.add(roomStateKey(setup.roomId));
    // Swap in a manager pointed at the failing store for the room-state repo only, reusing the same
    // underlying data (so the failure is purely a simulated Redis read failure, not missing data).
    const failingHarness = buildTimerHarness(deps, { ...repos, roomStateRepo: new KeyValueRoomStateRepository(failingStore) }, { logger });

    await expect(failingHarness.service.recoverRoom(setup.roomId)).resolves.toBeUndefined();

    expect(failingHarness.scheduler.getScheduled(setup.roomId)).toBeNull();
    const failureEntry = entries.find((e) => e.event === 'timer_recovery_load_failed');
    expect(failureEntry).toBeDefined();
    expect(failureEntry?.detail?.errorKind).toBe('RepositoryError');
  });

  it('20. a broadcast (onRoomMutated) failure does not undo the already-persisted state transition', async () => {
    const deps = createTestDeps(437);
    const repos = buildRepos(deps);
    const { logger, entries } = collectingLogger();
    const harness = buildTimerHarness(deps, repos, { logger });
    const setup = await setupRoomViaActor(harness, 5);
    await startGameViaActor(harness, setup.roomId); // ROLE_REVEAL
    const scheduled = harness.scheduler.getScheduled(setup.roomId)!;

    harness.service.setOnRoomMutated(() => {
      throw new Error('simulated broadcast failure');
    });

    await expect(harness.scheduler.advanceTo(scheduled.deadline)).resolves.toBeUndefined(); // never throws

    const room = harness.manager.get(setup.roomId).getSnapshot()!.room;
    expect(room.phase.state).toBe('GAME_INTRO'); // the mutation committed regardless

    const persisted = await repos.roomStateRepo.load(setup.roomId);
    expect(persisted?.phase.state).toBe('GAME_INTRO'); // and it's durable, not rolled back

    expect(entries.some((e) => e.event === 'timer_broadcast_failed')).toBe(true);
  });

  it('21. a simultaneous final accusation vote and an accusation-timer expiry are processed sequentially, never double-applied', async () => {
    const deps = createTestDeps(439);
    const repos = buildRepos(deps);
    const harness = buildTimerHarness(deps, repos);
    const setup = await setupRoomViaActor(harness, 5, {
      specialGame: { ...createDefaultConfig().specialGame, specialGameScheduleRuleId: 'placeholder-never' },
      rules: { ...createDefaultConfig().rules, roundsPerCycle: 1 },
    });
    await startGameViaActor(harness, setup.roomId);
    await ackAllRevealsViaActor(harness, setup.roomId, setup.playerIds);
    await driveViaTimersUntil(harness, setup.roomId, (s) => s === 'MINIGAME_SELECT');

    const room = harness.manager.get(setup.roomId).getSnapshot()!.room;
    const [initiatorId, suspectId, ...otherVoters] = setup.playerIds;
    await playerDispatch(harness, setup.roomId, initiatorId!, 'player:pushButton');
    const afterSelect = harness.manager.get(setup.roomId).getSnapshot()!.room;
    expect(afterSelect.phase.state).toBe('ACCUSATION_SELECT');
    await playerDispatch(harness, setup.roomId, initiatorId!, 'player:submitAccusation', { suspectIds: [suspectId] });

    const atVote = harness.manager.get(setup.roomId).getSnapshot()!.room;
    expect(atVote.phase.state).toBe('ACCUSATION_VOTE');
    const votePhaseId = atVote.phase.phaseId;

    // Every voter but the last casts a normal vote first.
    const [lastVoter, ...earlierVoters] = otherVoters;
    for (const voterId of earlierVoters) {
      const result = await playerDispatch(harness, setup.roomId, voterId, 'player:submitAccusationVote', { vote: 'REJECT' });
      expect(result.rejected).toBeUndefined();
    }
    await playerDispatch(harness, setup.roomId, initiatorId!, 'player:submitAccusationVote', { vote: 'REJECT' });

    // The final vote (which alone would complete ACCUSATION_VOTE) and the phase's own timer expiry race.
    const [voteOutcome] = await Promise.all([
      playerDispatch(harness, setup.roomId, lastVoter!, 'player:submitAccusationVote', { vote: 'REJECT' }),
      harness.fireExpiry(setup.roomId, votePhaseId),
    ]);

    const finalRoom = harness.manager.get(setup.roomId).getSnapshot()!.room;
    expect(finalRoom.phase.state).not.toBe('ACCUSATION_VOTE'); // exactly one exit from ACCUSATION_VOTE happened
    expect(finalRoom.accusationHistory).toHaveLength(1); // never double-recorded
    // Whichever of the two events won, the other one is provably harmless: it either got rejected
    // outright (STALE_PHASE) or, if it landed first, the other simply became a stale no-op timer —
    // either way there is only one AccusationRecord and only one terminal phase.
    void voteOutcome;
    void room;
  });

  it('22. MatchClock is driven entirely by the FSM, never directly read/written by phase-timer scheduling/expiry itself', async () => {
    const deps = createTestDeps(441);
    const harness = buildTimerHarness(deps, buildRepos(deps));
    const setup = await setupRoomViaActor(harness, 5);
    await startGameViaActor(harness, setup.roomId); // ROLE_REVEAL
    const matchClockAtStart = harness.manager.get(setup.roomId).getSnapshot()!.room.matchClock;
    expect(matchClockAtStart.status).toBe('pending'); // investigation gameplay hasn't started yet

    // Drive several purely timer-scheduled transitions. PhaseTimerService itself never imports or
    // references matchClock at all (MatchClockService, a fully separate scheduler, owns that
    // concern — see CORE_LOGIC_PHASE1_REPORT.md §5) — but the ROOM's matchClock legitimately
    // starts running as a side effect of the FSM's own handleGameIntro logic once GAME_INTRO exits,
    // proving the phase-timer subsystem correctly drives the FSM forward without needing any
    // special-case knowledge of the match clock to do so.
    await driveViaTimersUntil(harness, setup.roomId, (s) => s === 'HACKER_CORRUPTION');

    const matchClockLater = harness.manager.get(setup.roomId).getSnapshot()!.room.matchClock;
    expect(matchClockLater.status).toBe('running');
    expect(matchClockLater.deadlineAt).not.toBeNull();
  });
});
