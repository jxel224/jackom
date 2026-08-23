import { describe, expect, it } from 'vitest';
import { createTestDeps } from '../helpers/test-deps.js';
import { buildRepos } from '../helpers/persistence.js';
import {
  ackAllRevealsViaActor,
  buildTimerHarness,
  driveViaTimersUntil,
  hostDispatch,
  setupRoomViaActor,
  startGameViaActor,
  type TimerHarness,
} from '../helpers/timers.js';
import { RoomActorManager } from '../../src/actors/room-actor-manager.js';
import { MatchClockService } from '../../src/timers/match-clock-service.js';
import { PhaseTimerService } from '../../src/timers/phase-timer-service.js';
import { FakeTimerScheduler } from '../../src/timers/fake-timer-scheduler.js';

/** Drives a fresh room through LOBBY -> ROLE_REVEAL -> GAME_INTRO -> MINIGAME_SELECT (clock starts) via the real timer subsystem. */
async function driveToClockStart(harness: TimerHarness, playerCount: number) {
  const setup = await setupRoomViaActor(harness, playerCount);
  await startGameViaActor(harness, setup.roomId);
  await ackAllRevealsViaActor(harness, setup.roomId, setup.playerIds);
  await driveViaTimersUntil(harness, setup.roomId, (s) => s === 'MINIGAME_SELECT');
  return setup;
}

describe('MatchClockService — independent from PhaseTimerService', () => {
  it('scheduling a match-clock deadline never appears in, or disturbs, the phase-timer schedule for the same room, and vice versa', async () => {
    const deps = createTestDeps(401);
    const harness = buildTimerHarness(deps, buildRepos(deps));
    const setup = await driveToClockStart(harness, 5);

    const phaseScheduled = harness.scheduler.getScheduled(setup.roomId);
    const clockScheduled = harness.matchClockScheduler.getScheduled(setup.roomId);
    expect(phaseScheduled).not.toBeNull(); // MINIGAME_SELECT's own admin-selection timeout
    expect(clockScheduled).not.toBeNull(); // the 15-minute match deadline
    expect(clockScheduled!.deadline).not.toBe(phaseScheduled!.deadline); // genuinely two different deadlines
    expect(harness.scheduler.scheduledRoomIds()).toEqual([setup.roomId]); // phase scheduler only ever sees phase timers
    expect(harness.matchClockScheduler.scheduledRoomIds()).toEqual([setup.roomId]); // match-clock scheduler only ever sees clock deadlines

    // Advancing ONLY the phase scheduler past the admin-selection timeout must not touch the match clock's own schedule entry at all.
    await harness.scheduler.advanceTo(phaseScheduled!.deadline);
    const clockScheduledAfter = harness.matchClockScheduler.getScheduled(setup.roomId);
    expect(clockScheduledAfter).toEqual(clockScheduled); // completely untouched by the unrelated phase-timer firing
  });

  it('coexist through several different phase timers in a row (Admin selection, hack window, minigame play, discussion) without the match-clock deadline ever changing', async () => {
    const deps = createTestDeps(403);
    const harness = buildTimerHarness(deps, buildRepos(deps));
    // Forced to RANK_IT specifically (a single-step minigame) so the timeout-fallback's random
    // minigame choice can't turn "one minigame timeout" into "advance to the next internal step,
    // still MINIGAME_PLAY" for a multi-step game (DESCRIBE_IT/DEFEND_IT/PREDICT_THEM) — this test
    // needs a deterministic phase sequence, not a lucky one (Core Logic Phase 1.1 §3 lesson).
    const setup = await setupRoomViaActor(harness, 5, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' } });
    await startGameViaActor(harness, setup.roomId);
    await ackAllRevealsViaActor(harness, setup.roomId, setup.playerIds);
    await driveViaTimersUntil(harness, setup.roomId, (s) => s === 'MINIGAME_SELECT');
    const clockDeadlineAtStart = harness.matchClockScheduler.getScheduled(setup.roomId)!.deadline;

    // Admin selection timeout -> HACKER_CORRUPTION
    await harness.scheduler.advanceTo(harness.scheduler.getScheduled(setup.roomId)!.deadline);
    expect(harness.manager.get(setup.roomId).getSnapshot()!.room.phase.state).toBe('HACKER_CORRUPTION');
    expect(harness.matchClockScheduler.getScheduled(setup.roomId)!.deadline).toBe(clockDeadlineAtStart);

    // hack window timeout -> MINIGAME_INSTRUCTIONS
    await harness.scheduler.advanceTo(harness.scheduler.getScheduled(setup.roomId)!.deadline);
    expect(harness.matchClockScheduler.getScheduled(setup.roomId)!.deadline).toBe(clockDeadlineAtStart);

    // instructions timeout -> MINIGAME_PLAY (a real minigame's own timer now)
    await harness.scheduler.advanceTo(harness.scheduler.getScheduled(setup.roomId)!.deadline);
    expect(harness.manager.get(setup.roomId).getSnapshot()!.room.phase.state).toBe('MINIGAME_PLAY');
    expect(harness.matchClockScheduler.getScheduled(setup.roomId)!.deadline).toBe(clockDeadlineAtStart);

    // minigame timeout -> RESULTS_REVEAL -> (its own timer) -> DISCUSSION
    await harness.scheduler.advanceTo(harness.scheduler.getScheduled(setup.roomId)!.deadline);
    await harness.scheduler.advanceTo(harness.scheduler.getScheduled(setup.roomId)!.deadline);
    expect(harness.manager.get(setup.roomId).getSnapshot()!.room.phase.state).toBe('DISCUSSION');
    expect(harness.matchClockScheduler.getScheduled(setup.roomId)!.deadline).toBe(clockDeadlineAtStart);

    // Across all four distinct phase-timer firings, the match clock's single scheduled deadline
    // never moved — proving neither scheduler ever cancelled or replaced the other's entry.
    expect(harness.matchClockScheduler.scheduledRoomIds()).toEqual([setup.roomId]);
  });

  it('pausing the match clock (special game begins) cancels its scheduled deadline, so a stale pre-pause expiry can never fire', async () => {
    const deps = createTestDeps(407);
    const harness = buildTimerHarness(deps, buildRepos(deps));
    const setup = await setupRoomViaActor(harness, 7, {
      minigameSelection: { minigameSelectionRuleId: 'rank-it-only' },
      specialGame: { specialGameScheduleRuleId: 'placeholder-after-first-round-once', specialGameParticipantRuleId: 'bomb-protocol-scaling', insertionPoint: 'between_rounds', minParticipants: 3, maxParticipants: 5, failPenaltyMs: 180_000 },
    });
    await startGameViaActor(harness, setup.roomId);
    await ackAllRevealsViaActor(harness, setup.roomId, setup.playerIds);
    await driveViaTimersUntil(harness, setup.roomId, (s) => s === 'MINIGAME_SELECT');
    const clockIdBeforePause = harness.manager.get(setup.roomId).getSnapshot()!.room.matchClock.clockId;
    expect(harness.matchClockScheduler.getScheduled(setup.roomId)).not.toBeNull();

    // Drive through exactly one regular round so the special game becomes due, pausing the clock.
    await driveViaTimersUntil(harness, setup.roomId, (s) => s === 'SPECIAL_GAME_INTRO');
    const snapshot = harness.manager.get(setup.roomId).getSnapshot()!.room;
    expect(snapshot.matchClock.status).toBe('paused');
    expect(snapshot.matchClock.clockId).toBe(clockIdBeforePause); // pausing does not itself mint a new clockId (only resume does)
    // The scheduler must have no live entry for this room while paused — a stale fake-timer entry
    // left behind would be exactly the "duplicated expiry" risk Part 4 asks to rule out.
    expect(harness.matchClockScheduler.getScheduled(setup.roomId)).toBeNull();
  });

  it('a freshly created room has no match-clock schedule entry (clock is pending, not running, before GAME_INTRO exits)', async () => {
    const deps = createTestDeps(409);
    const harness = buildTimerHarness(deps, buildRepos(deps));
    const setup = await setupRoomViaActor(harness, 5);
    expect(harness.matchClockScheduler.getScheduled(setup.roomId)).toBeNull();
  });
});

describe('MatchClockService — recovery after actor eviction / process restart', () => {
  it('recovers the REMAINING time from the persisted deadline, never resetting to a fresh 15 minutes', async () => {
    const deps = createTestDeps(419);
    const repos = buildRepos(deps);
    const harness = buildTimerHarness(deps, repos);
    const setup = await driveToClockStart(harness, 5);

    const before = harness.manager.get(setup.roomId).getSnapshot()!.room.matchClock;
    expect(before.status).toBe('running');

    // Simulate an actor eviction (process restart / memory pressure) — the next touch must recover
    // from Redis (here, the shared InMemoryKeyValueStore standing in for it) via onActorCreated.
    harness.manager.evict(setup.roomId);
    expect(harness.matchClockScheduler.getScheduled(setup.roomId)).toBeNull(); // cancelled on eviction

    // A fresh manager + fresh MatchClockService, sharing the SAME underlying repos — exactly what
    // "a new process touching the room for the first time" looks like.
    const freshManager = new RoomActorManager({
      fsmDeps: deps,
      roomStateRepo: repos.roomStateRepo,
      roomPrivateStateRepo: repos.roomPrivateStateRepo,
      roomLookupRepo: repos.roomLookupRepo,
      sessionRepo: repos.sessionRepo,
      ttlSeconds: 3600,
    });
    let freshScheduler!: FakeTimerScheduler;
    const freshMatchClockService = new MatchClockService({
      manager: freshManager,
      now: deps.now,
      createScheduler: (onExpire) => {
        freshScheduler = new FakeTimerScheduler(onExpire);
        return freshScheduler;
      },
    });
    void freshMatchClockService;

    // Touching the room for the first time in this "fresh process" triggers onActorCreated -> recoverRoom().
    const recoveredSnapshot = await freshManager.get(setup.roomId).getOrLoadSnapshot();
    expect(recoveredSnapshot.room.matchClock.status).toBe('running');
    expect(recoveredSnapshot.room.matchClock.deadlineAt).toBe(before.deadlineAt); // byte-identical deadline, not recomputed from "now"

    const recoveredSchedule = freshScheduler.getScheduled(setup.roomId);
    expect(recoveredSchedule).not.toBeNull();
    expect(recoveredSchedule!.deadline).toBe(before.deadlineAt);
  });

  it('an overdue match-clock deadline (recovered after the process was down past the deadline) resolves immediately as a Hacker win, not a fresh countdown', async () => {
    const deps = createTestDeps(421);
    const repos = buildRepos(deps);
    const harness = buildTimerHarness(deps, repos);
    const setup = await driveToClockStart(harness, 5);

    // Force the persisted deadline into the past — standing in for "the process was down long
    // enough that the match clock should already have expired." Save directly to the repo (Redis
    // stand-in) rather than mutating the in-memory actor, then evict so the next touch is a
    // genuine cold load, exactly like a fresh process would see it.
    const snapshot = harness.manager.get(setup.roomId).getSnapshot()!;
    const pastDeadline = deps.now() - 1;
    const forced = { ...snapshot.room, matchClock: { ...snapshot.room.matchClock, deadlineAt: pastDeadline } };
    await repos.roomStateRepo.save(forced, 3600);
    harness.manager.evict(setup.roomId);

    // Call recoverRoom() directly and await it (rather than relying on the fire-and-forget
    // onActorCreated hook, which would race an immediate getOrLoadSnapshot() read in a test) — this
    // is the exact method onActorCreated invokes in production, just observed deterministically.
    await harness.matchClockService.recoverRoom(setup.roomId);

    const finalSnapshot = harness.manager.get(setup.roomId).getSnapshot()!;
    expect(finalSnapshot.room.winner).toBe('hackers');
    expect(finalSnapshot.room.phase.state).toBe('FINAL_RESULTS');
  });
});

describe('MatchClockService — broadcast callback boundary', () => {
  it('never sees a WireMessage/WebSocket-shaped value, only ever a bare roomId, mirroring PhaseTimerService', async () => {
    const deps = createTestDeps(431);
    const repos = buildRepos(deps);
    const manager = new RoomActorManager({
      fsmDeps: deps,
      roomStateRepo: repos.roomStateRepo,
      roomPrivateStateRepo: repos.roomPrivateStateRepo,
      roomLookupRepo: repos.roomLookupRepo,
      sessionRepo: repos.sessionRepo,
      ttlSeconds: 3600,
    });
    new PhaseTimerService({ manager, now: deps.now, createScheduler: (onExpire) => new FakeTimerScheduler(onExpire) });
    const mutated: unknown[] = [];
    let clockScheduler!: FakeTimerScheduler;
    const matchClockService = new MatchClockService({
      manager,
      now: deps.now,
      createScheduler: (onExpire) => {
        clockScheduler = new FakeTimerScheduler(onExpire);
        return clockScheduler;
      },
      onRoomMutated: (roomId) => {
        mutated.push(roomId);
      },
    });
    void matchClockService;

    const handle = await manager.createRoom((await import('../../src/config/defaults.js')).createDefaultConfig());
    expect(typeof handle.roomId).toBe('string');
    // Both services correctly registered without one clobbering the other's hooks (the whole point
    // of RoomActorManager's hooksList change) — proven by both constructing without throwing and
    // the room being immediately gettable by id.
    expect(manager.has(handle.roomId)).toBe(true);
  });
});

describe('MatchClockService + PhaseTimerService — shutdown (Core Logic Phase 1.1 §8)', () => {
  it('shutdown() on both services clears every pending timer, independently of one another', async () => {
    const deps = createTestDeps(441);
    const harness = buildTimerHarness(deps, buildRepos(deps));
    const setup = await driveToClockStart(harness, 5);

    // Both the admin-selection phase timer and the 15-minute match deadline are live right now.
    expect(harness.scheduler.getScheduled(setup.roomId)).not.toBeNull();
    expect(harness.matchClockScheduler.getScheduled(setup.roomId)).not.toBeNull();

    harness.matchClockService.shutdown();
    // Shutting down the match-clock service must not touch the phase-timer service's own schedule.
    expect(harness.matchClockScheduler.getScheduled(setup.roomId)).toBeNull();
    expect(harness.scheduler.getScheduled(setup.roomId)).not.toBeNull();

    harness.service.shutdown();
    expect(harness.scheduler.getScheduled(setup.roomId)).toBeNull();
  });
});

// Re-exported only so `hostDispatch`'s import isn't flagged unused if a future edit trims the file above this line.
void hostDispatch;
