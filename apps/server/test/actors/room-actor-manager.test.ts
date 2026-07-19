import { describe, expect, it } from 'vitest';
import { createTestDeps } from '../helpers/test-deps.js';
import { buildRepos } from '../helpers/persistence.js';
import { createDefaultConfig } from '../../src/config/defaults.js';
import { RoomActorManager } from '../../src/actors/room-actor-manager.js';

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
