import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startTestHttpApi, requestJson, type TestHttpApiSetup } from '../helpers/http.js';
import type { ApiErrorPayload, CreateRoomResponseBody, RoomAvailabilityResponseBody } from '../../src/shared.js';

async function createRoom(setup: TestHttpApiSetup) {
  const res = await requestJson<CreateRoomResponseBody>(`${setup.baseUrl}/api/rooms`, {
    method: 'POST',
    headers: { Cookie: setup.defaultHost.cookieHeader },
    body: JSON.stringify({ gameSlug: setup.defaultGameSlug }),
  });
  return res.body;
}

describe('GET /api/rooms/:roomCode', () => {
  let setup: TestHttpApiSetup;

  beforeEach(async () => {
    setup = await startTestHttpApi();
  });
  afterEach(async () => {
    await setup.close();
  });

  it('4. succeeds for a valid, existing, joinable room', async () => {
    const room = await createRoom(setup);
    const res = await requestJson<RoomAvailabilityResponseBody>(`${setup.baseUrl}/api/rooms/${room.roomCode}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ roomCode: room.roomCode, joinable: true, full: false, matchStarted: false, playerCount: 0, minPlayers: 4, maxPlayers: 10 });
  });

  it('resolves regardless of case (lowercase input normalizes to the stored uppercase code)', async () => {
    const room = await createRoom(setup);
    const res = await requestJson<RoomAvailabilityResponseBody>(`${setup.baseUrl}/api/rooms/${room.roomCode.toLowerCase()}`);
    expect(res.status).toBe(200);
    expect(res.body.roomCode).toBe(room.roomCode);
  });

  it('5a. rejects an unknown room code with 404 ROOM_NOT_FOUND', async () => {
    const res = await requestJson<ApiErrorPayload>(`${setup.baseUrl}/api/rooms/ZZZZZZ`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ROOM_NOT_FOUND');
  });

  it('5b. treats an expired room (TTL-evicted lookup) the same as not-found', async () => {
    const room = await createRoom(setup);
    // The only observable signal this architecture has for "expired" is the roomCode lookup
    // disappearing (Redis TTL) — simulated here directly, since there's no separate "expiry"
    // flag anywhere to fabricate instead.
    await setup.repos.roomLookupRepo.deleteRoomCode(room.roomCode);

    const res = await requestJson<ApiErrorPayload>(`${setup.baseUrl}/api/rooms/${room.roomCode}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ROOM_NOT_FOUND');
  });

  it('5c. rejects a malformed room-code segment without crashing', async () => {
    const res = await requestJson<ApiErrorPayload>(`${setup.baseUrl}/api/rooms/not-a-code!!`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_ROOM_CODE');
  });

  it('reflects a full room (full=true, joinable=false)', async () => {
    const room = await createRoom(setup);
    const roomId = (await setup.repos.roomLookupRepo.resolveRoomCode(room.roomCode))!;
    const persisted = await setup.repos.roomStateRepo.load(roomId);
    const shrunk = structuredClone(persisted!);
    shrunk.config.rules.maxPlayers = 1;
    shrunk.players[shrunk.roomId] = { playerId: shrunk.roomId, name: 'x', avatarId: 'default', alive: true, connectionStatus: 'connected', joinedAt: 0 };
    await setup.repos.roomStateRepo.save(shrunk);
    setup.manager.evict(roomId);

    const res = await requestJson<RoomAvailabilityResponseBody>(`${setup.baseUrl}/api/rooms/${room.roomCode}`);
    expect(res.body.full).toBe(true);
    expect(res.body.joinable).toBe(false);
  });

  it('reflects a room whose match already started (matchStarted=true, joinable=false)', async () => {
    const room = await createRoom(setup);
    const roomId = (await setup.repos.roomLookupRepo.resolveRoomCode(room.roomCode))!;
    const persisted = await setup.repos.roomStateRepo.load(roomId);
    const started = structuredClone(persisted!);
    started.phase = { ...started.phase, state: 'ROLE_REVEAL' };
    await setup.repos.roomStateRepo.save(started);
    setup.manager.evict(roomId);

    const res = await requestJson<RoomAvailabilityResponseBody>(`${setup.baseUrl}/api/rooms/${room.roomCode}`);
    expect(res.body.matchStarted).toBe(true);
    expect(res.body.joinable).toBe(false);
  });
});
