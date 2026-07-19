import { describe, expect, it } from 'vitest';
import { createTestDeps } from '../helpers/test-deps.js';
import { buildRepos } from '../helpers/persistence.js';
import { KeyValueSessionRepository } from '../../src/persistence/session-repo.js';
import { InMemoryKeyValueStore } from '../../src/persistence/in-memory-kv-store.js';

describe('SessionRepository', () => {
  it('3. host and player sessions resolve independently, and never collide', async () => {
    const deps = createTestDeps(47);
    const { sessionRepo } = buildRepos(deps);

    await sessionRepo.setHostSession('host-token-1', { roomId: 'room-1' });
    await sessionRepo.setPlayerSession('player-token-1', { roomId: 'room-1', playerId: 'p1' });

    expect(await sessionRepo.resolveHostSession('host-token-1')).toEqual({ roomId: 'room-1' });
    expect(await sessionRepo.resolvePlayerSession('player-token-1')).toEqual({ roomId: 'room-1', playerId: 'p1' });

    // A player token must never resolve as a host session, and vice versa, even if the same
    // literal string were (implausibly) reused — they live in separate key namespaces.
    expect(await sessionRepo.resolveHostSession('player-token-1')).toBeNull();
    expect(await sessionRepo.resolvePlayerSession('host-token-1')).toBeNull();
  });

  it('deleting one session does not affect the other', async () => {
    const deps = createTestDeps(53);
    const { sessionRepo } = buildRepos(deps);
    await sessionRepo.setHostSession('h1', { roomId: 'r1' });
    await sessionRepo.setPlayerSession('p1', { roomId: 'r1', playerId: 'x' });

    await sessionRepo.deleteHostSession('h1');

    expect(await sessionRepo.resolveHostSession('h1')).toBeNull();
    expect(await sessionRepo.resolvePlayerSession('p1')).toEqual({ roomId: 'r1', playerId: 'x' });
  });

  it('an expired session cannot be resolved', async () => {
    let clock = 0;
    const store = new InMemoryKeyValueStore(() => clock);
    const repo = new KeyValueSessionRepository(store, 5);

    await repo.setPlayerSession('tok', { roomId: 'r1', playerId: 'p1' });
    expect(await repo.resolvePlayerSession('tok')).not.toBeNull();

    clock += 6_000;
    expect(await repo.resolvePlayerSession('tok')).toBeNull();
  });

  it('refreshPlayerSessionTtl/refreshHostSessionTtl extend expiry without changing content', async () => {
    let clock = 0;
    const store = new InMemoryKeyValueStore(() => clock);
    const repo = new KeyValueSessionRepository(store, 5);
    await repo.setPlayerSession('tok', { roomId: 'r1', playerId: 'p1' });

    clock += 4_000;
    await repo.refreshPlayerSessionTtl('tok', 10);
    clock += 8_000; // would be expired under the original 5s ttl

    expect(await repo.resolvePlayerSession('tok')).toEqual({ roomId: 'r1', playerId: 'p1' });
  });
});
