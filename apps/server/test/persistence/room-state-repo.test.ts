import { describe, expect, it } from 'vitest';
import { createTestDeps } from '../helpers/test-deps.js';
import { buildRepos, FailingKeyValueStore } from '../helpers/persistence.js';
import { createDefaultConfig } from '../../src/config/defaults.js';
import { createRoom, joinPlayer } from '../../src/fsm/room-lifecycle.js';
import { KeyValueRoomStateRepository } from '../../src/persistence/room-state-repo.js';
import { InMemoryKeyValueStore } from '../../src/persistence/in-memory-kv-store.js';
import { RepositoryError } from '../../src/persistence/errors.js';
import { roomStateKey } from '../../src/persistence/keys.js';

describe('RoomStateRepository', () => {
  it('5a. loading a room reconstructs the full public state', async () => {
    const deps = createTestDeps(1);
    const { roomStateRepo } = buildRepos(deps);
    const { room } = createRoom(createDefaultConfig(), deps);

    await roomStateRepo.save(room);
    const loaded = await roomStateRepo.load(room.roomId);

    expect(loaded).toEqual(room);
  });

  it('4. player session tokens never appear in the persisted RoomState document', async () => {
    // NOTE: `hostSessionToken` legitimately lives on `RoomState.host` by architecture design
    // (ARCHITECTURE.md §8.3/§8.6 — HostSession is part of RoomState, unlike PlayerPrivate, which
    // lives only in RoomPrivateState). The real requirement this test guards is that PLAYER
    // session tokens — which DO live in RoomPrivateState — never leak into the public RoomState
    // document (PlayerPublic has no sessionToken field).
    const deps = createTestDeps(3);
    const { store, roomStateRepo, roomPrivateStateRepo } = buildRepos(deps);
    const created = createRoom(createDefaultConfig(), deps);
    let room = created.room;
    let priv = created.priv;

    const joined = joinPlayer(room, priv, { name: 'A', avatarId: 'a' }, deps);
    room = joined.room;
    priv = joined.priv;
    const playerSessionToken = joined.sessionToken!;

    await roomStateRepo.save(room);
    await roomPrivateStateRepo.save(priv);

    const rawPublic = await store.get(roomStateKey(room.roomId));
    expect(rawPublic).not.toContain(playerSessionToken);
    expect(rawPublic).not.toContain('sessionToken');
  });

  it('returns null for a room that was never saved', async () => {
    const deps = createTestDeps(5);
    const { roomStateRepo } = buildRepos(deps);
    expect(await roomStateRepo.load('does-not-exist')).toBeNull();
  });

  it('11. an expired room cannot be loaded', async () => {
    const deps = createTestDeps(7);
    const { room } = createRoom(createDefaultConfig(), deps);

    let clock = 0;
    const store = new InMemoryKeyValueStore(() => clock);
    const repo = new KeyValueRoomStateRepository(store, 5); // 5 second TTL

    await repo.save(room);
    expect(await repo.load(room.roomId)).not.toBeNull();

    clock += 6_000; // 6s > 5s ttl
    expect(await repo.load(room.roomId)).toBeNull();
  });

  it('an invalid JSON string is rejected with a typed INVALID_JSON error, not returned as data', async () => {
    const deps = createTestDeps(11);
    const { store, roomStateRepo } = buildRepos(deps);
    await store.set(roomStateKey('broken-room'), '{not valid json');

    await expect(roomStateRepo.load('broken-room')).rejects.toMatchObject({ code: 'INVALID_JSON' });
  });

  it('valid JSON with the wrong shape is rejected with a typed VALIDATION_FAILED error', async () => {
    const deps = createTestDeps(13);
    const { store, roomStateRepo } = buildRepos(deps);
    await store.set(roomStateKey('wrong-shape'), JSON.stringify({ hello: 'world' }));

    await expect(roomStateRepo.load('wrong-shape')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('a Redis read failure surfaces as a typed READ_FAILURE error', async () => {
    const deps = createTestDeps(17);
    const { store } = buildRepos(deps);
    const failing = new FailingKeyValueStore(store);
    failing.failGetForKeys.add(roomStateKey('r1'));
    const repo = new KeyValueRoomStateRepository(failing);

    await expect(repo.load('r1')).rejects.toBeInstanceOf(RepositoryError);
    await expect(repo.load('r1')).rejects.toMatchObject({ code: 'READ_FAILURE' });
  });

  it('a Redis write failure surfaces as a typed WRITE_FAILURE error', async () => {
    const deps = createTestDeps(19);
    const { store } = buildRepos(deps);
    const { room } = createRoom(createDefaultConfig(), deps);
    const failing = new FailingKeyValueStore(store);
    failing.failSetForKeys.add(roomStateKey(room.roomId));
    const repo = new KeyValueRoomStateRepository(failing);

    await expect(repo.save(room)).rejects.toMatchObject({ code: 'WRITE_FAILURE' });
  });
});
