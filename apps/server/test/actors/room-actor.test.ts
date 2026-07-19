import { describe, expect, it } from 'vitest';
import { createTestDeps } from '../helpers/test-deps.js';
import { buildRepos, collectingLogger, FailingKeyValueStore } from '../helpers/persistence.js';
import { createDefaultConfig } from '../../src/config/defaults.js';
import { createRoom } from '../../src/fsm/room-lifecycle.js';
import { RoomActor } from '../../src/actors/room-actor.js';
import { KeyValueRoomStateRepository } from '../../src/persistence/room-state-repo.js';
import { roomStateKey } from '../../src/persistence/keys.js';
import type { RoomState, RoomPrivateState } from '../../src/types/room-state.js';

function makeActor(
  deps: ReturnType<typeof createTestDeps>,
  repos: ReturnType<typeof buildRepos>,
  initial: { room: RoomState; priv: RoomPrivateState },
): RoomActor {
  return new RoomActor(
    initial.room.roomId,
    {
      fsmDeps: deps,
      roomStateRepo: repos.roomStateRepo,
      roomPrivateStateRepo: repos.roomPrivateStateRepo,
      roomLookupRepo: repos.roomLookupRepo,
      sessionRepo: repos.sessionRepo,
      ttlSeconds: 3600,
    },
    initial,
  );
}

describe('RoomActor', () => {
  it('9. loads the latest state from the repositories on first dispatch when not pre-hydrated', async () => {
    const deps = createTestDeps(71);
    const repos = buildRepos(deps);
    const created = createRoom(createDefaultConfig(), deps);
    await repos.roomStateRepo.save(created.room);
    await repos.roomPrivateStateRepo.save(created.priv);

    const actor = new RoomActor(created.room.roomId, {
      fsmDeps: deps,
      roomStateRepo: repos.roomStateRepo,
      roomPrivateStateRepo: repos.roomPrivateStateRepo,
      roomLookupRepo: repos.roomLookupRepo,
      sessionRepo: repos.sessionRepo,
      ttlSeconds: 3600,
    });

    expect(actor.getSnapshot()).toBeNull(); // not loaded yet
    const result = await actor.dispatch({ type: 'timer:expired', phaseId: created.room.phase.phaseId }, { kind: 'host' });
    expect(result.rejected).toBeDefined(); // LOBBY has no timer:expired handler — irrelevant to this test
    expect(actor.getSnapshot()?.room.roomId).toBe(created.room.roomId);
  });

  it('7 & 8. accepted events persist with an increased stateVersion; rejected events are not persisted at all', async () => {
    const deps = createTestDeps(73);
    const repos = buildRepos(deps);
    const created = createRoom(createDefaultConfig(), deps);
    const actor = makeActor(deps, repos, created);

    const stateVersionBefore = created.room.stateVersion;

    // Rejected: room only has 2 players, default minPlayers is 5.
    const rejectedResult = await actor.dispatch({ type: 'host:startGame', phaseId: created.room.phase.phaseId }, { kind: 'host' });
    expect(rejectedResult.rejected?.code).toBe('INVALID_PLAYER_COUNT');
    expect(await repos.roomStateRepo.load(created.room.roomId)).toBeNull(); // never persisted at all yet

    // Now accept an event: host:closeRoom is always valid and transitions to ABANDONED.
    const acceptedResult = await actor.dispatch({ type: 'host:closeRoom' }, { kind: 'host' });
    expect(acceptedResult.rejected).toBeUndefined();
    expect(acceptedResult.room.stateVersion).toBeGreaterThan(stateVersionBefore);

    const persisted = await repos.roomStateRepo.load(created.room.roomId);
    expect(persisted?.phase.state).toBe('ABANDONED');
    expect(persisted?.stateVersion).toBe(acceptedResult.room.stateVersion);
  });

  it('6. two dispatches fired back-to-back are processed strictly sequentially, never interleaved', async () => {
    const deps = createTestDeps(79);
    const repos = buildRepos(deps);
    const created = createRoom(createDefaultConfig(), deps);
    const actor = makeActor(deps, repos, created);

    // host:startGame is rejected (too few players) either way, but that's fine — what matters is
    // that BOTH dispatches complete, in order, without the second one starting before the first
    // one's persistence step has settled. Use two distinct accepted mutations to prove ordering:
    // close the room, then try to close it again (idempotent no-op the second time).
    const [first, second] = await Promise.all([
      actor.dispatch({ type: 'host:closeRoom' }, { kind: 'host' }),
      actor.dispatch({ type: 'host:closeRoom' }, { kind: 'host' }),
    ]);

    expect(first.room.phase.state).toBe('ABANDONED');
    expect(second.room.phase.state).toBe('ABANDONED');
    // If these had run concurrently against un-cloned shared state instead of sequentially through
    // the queue, stateVersion could end up inconsistent; sequential processing guarantees monotonic growth.
    expect(second.room.stateVersion).toBeGreaterThanOrEqual(first.room.stateVersion);

    const persisted = await repos.roomStateRepo.load(created.room.roomId);
    expect(persisted?.stateVersion).toBe(second.room.stateVersion);
  });

  it('10. TTLs for the room, roomCode lookup, host session, and player sessions refresh on every accepted event', async () => {
    // A clock that only advances when the TEST explicitly bumps it — NOT an auto-incrementing one
    // like createTestDeps()'s default. Auto-incrementing on every call would make TTL math
    // unpredictable here, since a single dispatch triggers many incidental now() calls (transition()
    // timestamps, each repo save, each TTL refresh's internal expiry check) before the test's own
    // "time passed" checkpoints are reached.
    let clock = 0;
    const baseDeps = createTestDeps(83);
    const deps = { ...baseDeps, now: () => clock };

    const ttlSeconds = 5;
    const repos = buildRepos(deps, ttlSeconds);
    const created = createRoom(createDefaultConfig(), deps);
    await repos.roomStateRepo.save(created.room, ttlSeconds);
    await repos.roomPrivateStateRepo.save(created.priv, ttlSeconds);
    await repos.roomLookupRepo.setRoomCode(created.room.roomCode, created.room.roomId, ttlSeconds);
    await repos.sessionRepo.setHostSession(created.hostSessionToken, { roomId: created.room.roomId }, ttlSeconds);

    const actor = new RoomActor(
      created.room.roomId,
      {
        fsmDeps: deps,
        roomStateRepo: repos.roomStateRepo,
        roomPrivateStateRepo: repos.roomPrivateStateRepo,
        roomLookupRepo: repos.roomLookupRepo,
        sessionRepo: repos.sessionRepo,
        ttlSeconds,
      },
      created,
    );

    clock = 3_000; // 3s in — nothing has expired yet
    await actor.dispatch({ type: 'host:closeRoom' }, { kind: 'host' }); // an accepted event, refreshes TTLs

    clock = 7_000; // 7s from creation — would have expired the ORIGINAL 5s ttl, but it was refreshed at t=3s
    expect(await repos.roomStateRepo.load(created.room.roomId)).not.toBeNull();
    expect(await repos.roomLookupRepo.resolveRoomCode(created.room.roomCode)).toBe(created.room.roomId);
    expect(await repos.sessionRepo.resolveHostSession(created.hostSessionToken)).toEqual({ roomId: created.room.roomId });
  });

  it('13. a Redis write failure does not corrupt the actor\'s in-memory authoritative state', async () => {
    const deps = createTestDeps(89);
    const repos = buildRepos(deps);
    const created = createRoom(createDefaultConfig(), deps);
    const failingStore = new FailingKeyValueStore(repos.store);
    const failingRoomStateRepo = new KeyValueRoomStateRepository(failingStore);

    const actor = new RoomActor(created.room.roomId, {
      fsmDeps: deps,
      roomStateRepo: failingRoomStateRepo,
      roomPrivateStateRepo: repos.roomPrivateStateRepo,
      roomLookupRepo: repos.roomLookupRepo,
      sessionRepo: repos.sessionRepo,
      ttlSeconds: 3600,
    }, created);

    failingStore.failSetForKeys.add(roomStateKey(created.room.roomId));

    await expect(actor.dispatch({ type: 'host:closeRoom' }, { kind: 'host' })).rejects.toMatchObject({ code: 'PARTIAL_PERSISTENCE_FAILURE' });

    // The in-memory snapshot must be untouched — still LOBBY, not silently advanced to ABANDONED.
    expect(actor.getSnapshot()?.room.phase.state).toBe('LOBBY');

    // Once the failure is resolved, the actor still works normally from its last-known-good state.
    failingStore.failSetForKeys.clear();
    const retried = await actor.dispatch({ type: 'host:closeRoom' }, { kind: 'host' });
    expect(retried.rejected).toBeUndefined();
    expect(retried.room.phase.state).toBe('ABANDONED');
  });

  it('a partial persistence failure (public save succeeds, private save fails) does not leave a lone public half readable afterward', async () => {
    const deps = createTestDeps(97);
    const repos = buildRepos(deps);
    const created = createRoom(createDefaultConfig(), deps);
    const failingPrivateStore = new FailingKeyValueStore(repos.store);
    const { KeyValueRoomPrivateStateRepository } = await import('../../src/persistence/room-private-state-repo.js');
    const failingPrivateRepo = new KeyValueRoomPrivateStateRepository(failingPrivateStore);

    const actor = new RoomActor(created.room.roomId, {
      fsmDeps: deps,
      roomStateRepo: repos.roomStateRepo,
      roomPrivateStateRepo: failingPrivateRepo,
      roomLookupRepo: repos.roomLookupRepo,
      sessionRepo: repos.sessionRepo,
      ttlSeconds: 3600,
    }, created);

    const { roomPrivateStateKey } = await import('../../src/persistence/keys.js');
    failingPrivateStore.failSetForKeys.add(roomPrivateStateKey(created.room.roomId));

    await expect(actor.dispatch({ type: 'host:closeRoom' }, { kind: 'host' })).rejects.toMatchObject({ code: 'PARTIAL_PERSISTENCE_FAILURE' });

    // Compensating delete should have removed the just-written public half.
    expect(await repos.roomStateRepo.load(created.room.roomId)).toBeNull();
  });

  it('14. private state and session tokens are never written to any log entry, even across a forced failure', async () => {
    const deps = createTestDeps(101);
    const repos = buildRepos(deps);
    const created = createRoom(createDefaultConfig(), deps);
    const { logger, entries } = collectingLogger();
    const failingStore = new FailingKeyValueStore(repos.store);
    const failingRepo = new KeyValueRoomStateRepository(failingStore);

    const actor = new RoomActor(created.room.roomId, {
      fsmDeps: deps,
      roomStateRepo: failingRepo,
      roomPrivateStateRepo: repos.roomPrivateStateRepo,
      roomLookupRepo: repos.roomLookupRepo,
      sessionRepo: repos.sessionRepo,
      ttlSeconds: 3600,
      logger,
    }, created);

    failingStore.failSetForKeys.add(roomStateKey(created.room.roomId));
    await actor.dispatch({ type: 'host:closeRoom' }, { kind: 'host' }).catch(() => {});

    const serializedLogs = JSON.stringify(entries);
    expect(serializedLogs).not.toContain(created.hostSessionToken);
    for (const p of Object.values(created.priv.players)) {
      expect(serializedLogs).not.toContain(p.sessionToken);
    }
    expect(entries.length).toBeGreaterThan(0); // sanity: something WAS logged
  });
});
