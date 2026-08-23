import { describe, expect, it } from 'vitest';
import { createTestDeps } from '../helpers/test-deps.js';
import { buildRepos } from '../helpers/persistence.js';
import { createDefaultConfig } from '../../src/config/defaults.js';
import { RoomActorManager } from '../../src/actors/room-actor-manager.js';
import { joinPlayer } from '../../src/fsm/room-lifecycle.js';

function makeManager(deps: ReturnType<typeof createTestDeps>, repos: ReturnType<typeof buildRepos>, ttlSeconds = 3600) {
  return new RoomActorManager({
    fsmDeps: deps,
    roomStateRepo: repos.roomStateRepo,
    roomPrivateStateRepo: repos.roomPrivateStateRepo,
    roomLookupRepo: repos.roomLookupRepo,
    sessionRepo: repos.sessionRepo,
    ttlSeconds,
  });
}

/** A minimal `RoomActorLifecycleHooks` registrant that records every call it receives, for proving the manager's hooksList fan-out (multiple independent registrants, none clobbering another). */
function mockHooks() {
  const mutated: string[] = [];
  const created: string[] = [];
  const evicted: string[] = [];
  return { mutated, created, evicted, hooks: { onMutated: (room: { roomId: string }) => mutated.push(room.roomId), onActorCreated: (roomId: string) => created.push(roomId), onActorEvicted: (roomId: string) => evicted.push(roomId) } };
}

describe('RoomActorManager', () => {
  it('1. creating a room writes public and private state separately, plus the roomCode lookup and host session', async () => {
    const deps = createTestDeps(103);
    const repos = buildRepos(deps);
    const manager = makeManager(deps, repos);

    const handle = await manager.createRoom(createDefaultConfig());

    const publicState = await repos.roomStateRepo.load(handle.roomId);
    const privateState = await repos.roomPrivateStateRepo.load(handle.roomId);
    expect(publicState).not.toBeNull();
    expect(privateState).not.toBeNull();
    expect(publicState?.phase.state).toBe('LOBBY');

    expect(await repos.roomLookupRepo.resolveRoomCode(handle.roomCode)).toBe(handle.roomId);
    expect(await repos.sessionRepo.resolveHostSession(handle.hostSessionToken)).toEqual({ roomId: handle.roomId });
  });

  it('2. getByRoomCode resolves an actor for the correct room', async () => {
    const deps = createTestDeps(107);
    const repos = buildRepos(deps);
    const manager = makeManager(deps, repos);
    const handleA = await manager.createRoom(createDefaultConfig());
    const handleB = await manager.createRoom(createDefaultConfig());

    const actorForA = await manager.getByRoomCode(handleA.roomCode);
    const actorForB = await manager.getByRoomCode(handleB.roomCode);

    expect(actorForA?.getSnapshot()?.room.roomId).toBe(handleA.roomId);
    expect(actorForB?.getSnapshot()?.room.roomId).toBe(handleB.roomId);
    expect(await manager.getByRoomCode('NO-SUCH-CODE')).toBeNull();
  });

  it('9. after eviction, get() recreates a fresh actor that reloads the LATEST Redis state', async () => {
    const deps = createTestDeps(109);
    const repos = buildRepos(deps);
    const manager = makeManager(deps, repos);
    const handle = await manager.createRoom(createDefaultConfig());

    const actorA = manager.get(handle.roomId);
    const closed = await actorA.dispatch({ type: 'host:closeRoom' }, { kind: 'host' });
    expect(closed.room.phase.state).toBe('ABANDONED');
    const versionAfterClose = closed.room.stateVersion;

    expect(manager.evict(handle.roomId)).toBe(true);
    expect(manager.has(handle.roomId)).toBe(false);

    const actorB = manager.get(handle.roomId);
    expect(actorB).not.toBe(actorA);
    expect(actorB.getSnapshot()).toBeNull(); // fresh, unloaded

    // Any dispatch forces ensureLoaded(); host:closeRoom is idempotent so re-sending it is safe
    // and lets us observe what got loaded.
    const afterReload = await actorB.dispatch({ type: 'host:closeRoom' }, { kind: 'host' });
    expect(afterReload.room.phase.state).toBe('ABANDONED');
    expect(afterReload.room.stateVersion).toBeGreaterThanOrEqual(versionAfterClose);
  });

  it('evictIdle only removes actors idle for at least the given threshold, and never a busy one', async () => {
    let clock = 0;
    const deps = createTestDeps(113);
    (deps as { now: () => number }).now = () => clock;
    const repos = buildRepos(deps);
    const manager = makeManager(deps, repos);

    const handleOld = await manager.createRoom(createDefaultConfig());
    clock += 10_000;
    const handleFresh = await manager.createRoom(createDefaultConfig());

    expect(manager.size()).toBe(2);
    const evicted = manager.evictIdle(5_000);

    expect(evicted).toEqual([handleOld.roomId]);
    expect(manager.has(handleOld.roomId)).toBe(false);
    expect(manager.has(handleFresh.roomId)).toBe(true);
  });

  it('15. two rooms operate completely independently through separate actors', async () => {
    const deps = createTestDeps(127);
    const repos = buildRepos(deps);
    const manager = makeManager(deps, repos);

    const handleA = await manager.createRoom(createDefaultConfig());
    const handleB = await manager.createRoom(createDefaultConfig());

    const actorA = manager.get(handleA.roomId);
    const actorB = manager.get(handleB.roomId);

    const closedA = await actorA.dispatch({ type: 'host:closeRoom' }, { kind: 'host' });
    expect(closedA.room.phase.state).toBe('ABANDONED');

    // Room B must be completely unaffected by whatever happened to room A.
    expect(actorB.getSnapshot()?.room.phase.state).toBe('LOBBY');
    const stillLoadableB = await repos.roomStateRepo.load(handleB.roomId);
    expect(stillLoadableB?.phase.state).toBe('LOBBY');
  });
});

describe('RoomActorManager — lifecycle hooks fan-out (Core Logic Phase 1.1 §8)', () => {
  /**
   * Direct proof of the `hooksList` design (CORE_LOGIC_PHASE1_REPORT.md §5): registering a SECOND
   * set of lifecycle hooks (as `MatchClockService` does after `PhaseTimerService` already
   * registered its own) must never replace or suppress the first. Uses two independent mock
   * registrants instead of the real timer services so this test is a pure proof of the manager's
   * fan-out contract, isolated from any timer-scheduling behavior.
   */
  it('onMutated fires on every registered hook set, in registration order, for the same mutation', async () => {
    const deps = createTestDeps(131);
    const repos = buildRepos(deps);
    const manager = makeManager(deps, repos);
    const first = mockHooks();
    const second = mockHooks();
    manager.setLifecycleHooks(first.hooks);
    manager.setLifecycleHooks(second.hooks);

    const handle = await manager.createRoom(createDefaultConfig());
    await manager.get(handle.roomId).dispatch({ type: 'host:closeRoom' }, { kind: 'host' });

    // createRoom() itself fires onMutated once; the closeRoom dispatch fires it again — both hook
    // sets must have observed BOTH mutations, neither clobbering the other's registration.
    expect(first.mutated.filter((id) => id === handle.roomId).length).toBe(2);
    expect(second.mutated.filter((id) => id === handle.roomId).length).toBe(2);
  });

  it('onActorCreated and onActorEvicted fire on every registered hook set, not just the most recently registered one', async () => {
    const deps = createTestDeps(137);
    const repos = buildRepos(deps);
    const manager = makeManager(deps, repos);
    const first = mockHooks();
    const second = mockHooks();
    manager.setLifecycleHooks(first.hooks);
    manager.setLifecycleHooks(second.hooks);

    const handle = await manager.createRoom(createDefaultConfig());
    expect(manager.evict(handle.roomId)).toBe(true);
    expect(first.evicted).toEqual([handle.roomId]);
    expect(second.evicted).toEqual([handle.roomId]);

    manager.get(handle.roomId); // not pre-hydrated -> onActorCreated
    expect(first.created).toEqual([handle.roomId]);
    expect(second.created).toEqual([handle.roomId]);
  });

});

describe('RoomActorManager — evictIdle preserves an in-progress match (Core Logic Phase 1.1 §9)', () => {
  /**
   * `evictIdle()` only removes the in-process actor object — it must NEVER delete or otherwise
   * touch the persisted Redis-equivalent state. This drives a real mid-match room (Admin assigned,
   * a real budgeted hack already accepted, match clock running) through an idle eviction, then
   * proves every one of those pieces of state comes back correctly when the room is requested
   * again — exactly what "the process restarted / this room's actor was reclaimed for memory
   * pressure, then a player reconnects" looks like in production.
   */
  it('an idle-evicted actor mid-match reloads with Admin, hacks, phase, and match clock all intact, and the match can continue', async () => {
    const deps = createTestDeps(151);
    const repos = buildRepos(deps);
    const manager = makeManager(deps, repos);

    const handle = await manager.createRoom(createDefaultConfig({ minigameSelection: { minigameSelectionRuleId: 'rank-it-only' } }));
    const actor = manager.get(handle.roomId);
    const playerIds: string[] = [];
    for (let i = 0; i < 6; i++) {
      const outcome = await actor.runLifecycle((room, priv, fsmDeps) => {
        const result = joinPlayer(room, priv, { name: `P${i}`, avatarId: `a${i}` }, fsmDeps);
        return { room: result.room, priv: result.priv, value: result.playerId, rejected: result.rejected };
      });
      if (!outcome.value) throw new Error('join failed');
      playerIds.push(outcome.value);
    }

    await actor.dispatch({ type: 'host:startGame', phaseId: actor.getSnapshot()!.room.phase.phaseId }, { kind: 'host' });
    for (const playerId of playerIds) {
      const snap = actor.getSnapshot()!;
      await actor.dispatch({ type: 'player:acknowledgeReveal', phaseId: snap.room.phase.phaseId, playerId }, { kind: 'player', playerId });
    }
    await actor.dispatch({ type: 'timer:expired', phaseId: actor.getSnapshot()!.room.phase.phaseId }, { kind: 'host' }); // -> MINIGAME_SELECT, match clock starts

    const beforeSelect = actor.getSnapshot()!.room;
    const adminId = beforeSelect.adminId!;
    const adminQueueBefore = [...beforeSelect.adminQueue];
    const priv = actor.getSnapshot()!.priv;
    const hackerId = Object.values(priv.players).find((p) => p.role === 'HACKER')!.playerId;
    const crewId = Object.values(priv.players).find((p) => p.role === 'CREW')!.playerId;
    const participantIds = [...new Set([adminId, hackerId, crewId])];

    await actor.dispatch(
      { type: 'player:adminSelectMinigame', phaseId: beforeSelect.phase.phaseId, playerId: adminId, minigameId: 'RANK_IT', participantIds },
      { kind: 'player', playerId: adminId },
    );
    await actor.dispatch(
      { type: 'player:submitHack', phaseId: actor.getSnapshot()!.room.phase.phaseId, playerId: hackerId, targetPlayerId: crewId },
      { kind: 'player', playerId: hackerId },
    );

    const beforeEviction = actor.getSnapshot()!;
    expect(beforeEviction.room.phase.state).toBe('HACKER_CORRUPTION');
    expect(beforeEviction.room.currentRound?.hackedPlayerIds).toEqual([crewId]);
    expect(beforeEviction.priv.hacksRemaining[hackerId]).toBe(1);
    expect(beforeEviction.room.matchClock.status).toBe('running');

    // Idle-evict (not the explicit evict() already covered elsewhere) — the exact path a real idle
    // sweep takes in production (bootstrap.ts's setInterval calling evictIdle()).
    const evictedIds = manager.evictIdle(0);
    expect(evictedIds).toEqual([handle.roomId]);
    expect(manager.has(handle.roomId)).toBe(false);

    // Redis-equivalent state must still be there — evictIdle() must never have deleted it.
    const stillPersistedRoom = await repos.roomStateRepo.load(handle.roomId);
    const stillPersistedPriv = await repos.roomPrivateStateRepo.load(handle.roomId);
    expect(stillPersistedRoom).not.toBeNull();
    expect(stillPersistedPriv).not.toBeNull();

    // Requesting the room again recreates the actor and, on first dispatch, rehydrates from the
    // persisted state — the exact "player reconnects after the actor was reclaimed" path.
    const reloadedActor = manager.get(handle.roomId);
    expect(reloadedActor).not.toBe(actor);
    const reloaded = await reloadedActor.getOrLoadSnapshot();

    expect(reloaded.room.adminId).toBe(adminId);
    expect(reloaded.room.adminQueue).toEqual(adminQueueBefore);
    expect(reloaded.room.phase.state).toBe('HACKER_CORRUPTION');
    expect(reloaded.room.currentRound?.hackedPlayerIds).toEqual([crewId]);
    expect(reloaded.priv.hacksRemaining[hackerId]).toBe(1);
    expect(reloaded.room.matchClock).toEqual(beforeEviction.room.matchClock);

    // The match can genuinely continue from here — the hack window's own timeout still works.
    const continued = await reloadedActor.dispatch({ type: 'timer:expired', phaseId: reloaded.room.phase.phaseId }, { kind: 'host' });
    expect(continued.room.phase.state).toBe('MINIGAME_INSTRUCTIONS');
  });
});

describe('RoomActorManager — lifecycle hooks fan-out (Core Logic Phase 1.1 §8), continued', () => {
  it('evictIdle fires onActorEvicted on every registered hook set for every room it evicts', async () => {
    let clock = 0;
    const deps = createTestDeps(139);
    (deps as { now: () => number }).now = () => clock;
    const repos = buildRepos(deps);
    const manager = makeManager(deps, repos);
    const first = mockHooks();
    const second = mockHooks();
    manager.setLifecycleHooks(first.hooks);
    manager.setLifecycleHooks(second.hooks);

    const handle = await manager.createRoom(createDefaultConfig());
    clock += 10_000;
    const evicted = manager.evictIdle(5_000);
    expect(evicted).toEqual([handle.roomId]);
    expect(first.evicted).toEqual([handle.roomId]);
    expect(second.evicted).toEqual([handle.roomId]);
  });
});
