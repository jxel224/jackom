import { describe, expect, it } from 'vitest';
import { createTestDeps } from '../helpers/test-deps.js';
import { buildRepos } from '../helpers/persistence.js';
import { createDefaultConfig } from '../../src/config/defaults.js';
import { createRoom } from '../../src/fsm/room-lifecycle.js';
import { RoomActor } from '../../src/actors/room-actor.js';
import { RoomConsistencyError } from '../../src/persistence/errors.js';

function actorDepsFrom(deps: ReturnType<typeof createTestDeps>, repos: ReturnType<typeof buildRepos>) {
  return {
    fsmDeps: deps,
    roomStateRepo: repos.roomStateRepo,
    roomPrivateStateRepo: repos.roomPrivateStateRepo,
    roomLookupRepo: repos.roomLookupRepo,
    sessionRepo: repos.sessionRepo,
    ttlSeconds: 3600,
  };
}

describe('Consistency: missing public/private halves', () => {
  it('12a. public state present, private state missing -> typed PRIVATE_STATE_MISSING error', async () => {
    const deps = createTestDeps(59);
    const repos = buildRepos(deps);
    const { room } = createRoom(createDefaultConfig(), deps);
    await repos.roomStateRepo.save(room); // ONLY the public half

    const actor = new RoomActor(room.roomId, actorDepsFrom(deps, repos));

    await expect(actor.dispatch({ type: 'host:startGame', phaseId: room.phase.phaseId }, { kind: 'host' })).rejects.toMatchObject({
      code: 'PRIVATE_STATE_MISSING',
    });
  });

  it('12b. private state present, public state missing -> typed PUBLIC_STATE_MISSING error', async () => {
    const deps = createTestDeps(61);
    const repos = buildRepos(deps);
    const { room, priv } = createRoom(createDefaultConfig(), deps);
    await repos.roomPrivateStateRepo.save(priv); // ONLY the private half

    const actor = new RoomActor(room.roomId, actorDepsFrom(deps, repos));

    await expect(actor.dispatch({ type: 'host:startGame', phaseId: room.phase.phaseId }, { kind: 'host' })).rejects.toMatchObject({
      code: 'PUBLIC_STATE_MISSING',
    });
  });

  it('neither half exists -> ROOM_NOT_FOUND, distinguishable from a mismatch', async () => {
    const deps = createTestDeps(67);
    const repos = buildRepos(deps);
    const actor = new RoomActor('never-created', actorDepsFrom(deps, repos));

    await expect(actor.dispatch({ type: 'host:startGame', phaseId: 'whatever' }, { kind: 'host' })).rejects.toBeInstanceOf(RoomConsistencyError);
    await expect(actor.dispatch({ type: 'host:startGame', phaseId: 'whatever' }, { kind: 'host' })).rejects.toMatchObject({
      code: 'ROOM_NOT_FOUND',
    });
  });
});
