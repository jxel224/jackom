import { describe, expect, it } from 'vitest';
import { createTestDeps } from '../helpers/test-deps.js';
import { buildRepos } from '../helpers/persistence.js';
import { createDefaultConfig } from '../../src/config/defaults.js';
import { createRoom, joinPlayer } from '../../src/fsm/room-lifecycle.js';
import { roomPrivateStateKey } from '../../src/persistence/keys.js';

describe('RoomPrivateStateRepository', () => {
  it('5b. loading a room reconstructs the full private state, including roles and session tokens', async () => {
    const deps = createTestDeps(23);
    const { roomPrivateStateRepo } = buildRepos(deps);
    const created = createRoom(createDefaultConfig(), deps);
    const joined = joinPlayer(created.room, created.priv, { name: 'A', avatarId: 'a' }, deps);

    await roomPrivateStateRepo.save(joined.priv);
    const loaded = await roomPrivateStateRepo.load(joined.room.roomId);

    expect(loaded).toEqual(joined.priv);
    expect(loaded?.players[joined.playerId!]?.sessionToken).toBe(joined.sessionToken);
  });

  it('an invalid JSON string is rejected, not silently returned', async () => {
    const deps = createTestDeps(29);
    const { store, roomPrivateStateRepo } = buildRepos(deps);
    await store.set(roomPrivateStateKey('broken'), 'not json at all {{{');

    await expect(roomPrivateStateRepo.load('broken')).rejects.toMatchObject({ code: 'INVALID_JSON' });
  });

  it('a validation error never includes the offending token/role VALUES, only structural info', async () => {
    const deps = createTestDeps(31);
    const { store, roomPrivateStateRepo } = buildRepos(deps);
    // Same shape as a real RoomPrivateState, but role is an invalid enum value.
    await store.set(
      roomPrivateStateKey('bad-role'),
      JSON.stringify({
        roomId: 'bad-role',
        players: { p1: { playerId: 'p1', sessionToken: 'THE-SECRET-TOKEN', role: 'NOT_A_REAL_ROLE', lastSeenAt: 1 } },
        currentCorruptionChoices: {},
      }),
    );

    try {
      await roomPrivateStateRepo.load('bad-role');
      expect.unreachable('expected load() to throw');
    } catch (err) {
      expect((err as Error).message).not.toContain('THE-SECRET-TOKEN');
      expect((err as { code?: string }).code).toBe('VALIDATION_FAILED');
    }
  });
});
