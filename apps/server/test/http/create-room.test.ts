import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startTestHttpApi, requestJson, type TestHttpApiSetup } from '../helpers/http.js';
import { collectingLogger } from '../helpers/persistence.js';
import { ROOM_CODE_LENGTH, isValidRoomCodeFormat } from '../../src/shared.js';
import type { CreateRoomResponseBody } from '../../src/shared.js';

describe('POST /api/rooms', () => {
  let setup: TestHttpApiSetup;

  beforeEach(async () => {
    setup = await startTestHttpApi();
  });
  afterEach(async () => {
    await setup.close();
  });

  it('1. returns a real, normalized room code', async () => {
    const res = await requestJson<CreateRoomResponseBody>(`${setup.baseUrl}/api/rooms`, { method: 'POST', body: '{}' });
    expect(res.status).toBe(201);
    expect(res.body.roomCode).toHaveLength(ROOM_CODE_LENGTH);
    expect(isValidRoomCodeFormat(res.body.roomCode)).toBe(true);
  });

  it('an empty/absent body is accepted (no config-selection input is required)', async () => {
    const res = await requestJson<CreateRoomResponseBody>(`${setup.baseUrl}/api/rooms`, { method: 'POST' });
    expect(res.status).toBe(201);
  });

  it('2. creates a valid, resolvable host session', async () => {
    const res = await requestJson<CreateRoomResponseBody>(`${setup.baseUrl}/api/rooms`, { method: 'POST', body: '{}' });
    const record = await setup.repos.sessionRepo.resolveHostSession(res.body.hostSessionToken);
    expect(record).not.toBeNull();
  });

  it('3. persists the room and host session, and returns a safe initial LOBBY TvView', async () => {
    const res = await requestJson<CreateRoomResponseBody>(`${setup.baseUrl}/api/rooms`, { method: 'POST', body: '{}' });

    const roomId = await setup.repos.roomLookupRepo.resolveRoomCode(res.body.roomCode);
    expect(roomId).not.toBeNull();

    const persistedRoom = await setup.repos.roomStateRepo.load(roomId!);
    const persistedPriv = await setup.repos.roomPrivateStateRepo.load(roomId!);
    expect(persistedRoom?.roomCode).toBe(res.body.roomCode);
    expect(persistedPriv).not.toBeNull();

    expect(res.body.tv.roomCode).toBe(res.body.roomCode);
    expect(res.body.tv.phase.state).toBe('LOBBY');
    expect(res.body.tv.players).toEqual([]);
  });

  it('two consecutive creates never collide on room code', async () => {
    const first = await requestJson<CreateRoomResponseBody>(`${setup.baseUrl}/api/rooms`, { method: 'POST', body: '{}' });
    const second = await requestJson<CreateRoomResponseBody>(`${setup.baseUrl}/api/rooms`, { method: 'POST', body: '{}' });
    expect(first.body.roomCode).not.toBe(second.body.roomCode);
    expect(first.body.hostSessionToken).not.toBe(second.body.hostSessionToken);
  });

  it('12 & 13. never returns raw RoomState or RoomPrivateState fields', async () => {
    const res = await requestJson<CreateRoomResponseBody>(`${setup.baseUrl}/api/rooms`, { method: 'POST', body: '{}' });
    const raw = JSON.stringify(res.body);
    for (const forbidden of ['stateVersion', 'matchLog', 'currentPhaseSubmissions', 'roundHistory', 'currentCorruptionChoices', '"role"', 'sessionToken']) {
      expect(raw).not.toContain(forbidden);
    }
  });

  it('14. never logs the host session token', async () => {
    const { logger, entries } = collectingLogger();
    const loggedSetup = await startTestHttpApi({ logger });
    const res = await requestJson<CreateRoomResponseBody>(`${loggedSetup.baseUrl}/api/rooms`, { method: 'POST', body: '{}' });
    expect(JSON.stringify(entries)).not.toContain(res.body.hostSessionToken);
    await loggedSetup.close();
  });
});
