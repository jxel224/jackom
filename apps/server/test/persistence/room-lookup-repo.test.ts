import { describe, expect, it } from 'vitest';
import { createTestDeps } from '../helpers/test-deps.js';
import { buildRepos } from '../helpers/persistence.js';

describe('RoomLookupRepository', () => {
  it('2. resolves a room code to the correct roomId, and only that one', async () => {
    const deps = createTestDeps(37);
    const { roomLookupRepo } = buildRepos(deps);

    await roomLookupRepo.setRoomCode('AAA111', 'room-a');
    await roomLookupRepo.setRoomCode('BBB222', 'room-b');

    expect(await roomLookupRepo.resolveRoomCode('AAA111')).toBe('room-a');
    expect(await roomLookupRepo.resolveRoomCode('BBB222')).toBe('room-b');
    expect(await roomLookupRepo.resolveRoomCode('CCC333')).toBeNull();
  });

  it('an unknown room code resolves to null', async () => {
    const deps = createTestDeps(41);
    const { roomLookupRepo } = buildRepos(deps);
    expect(await roomLookupRepo.resolveRoomCode('NOPE00')).toBeNull();
  });

  it('deleteRoomCode removes the mapping', async () => {
    const deps = createTestDeps(43);
    const { roomLookupRepo } = buildRepos(deps);
    await roomLookupRepo.setRoomCode('DEL123', 'room-x');
    await roomLookupRepo.deleteRoomCode('DEL123');
    expect(await roomLookupRepo.resolveRoomCode('DEL123')).toBeNull();
  });
});
