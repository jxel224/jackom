import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startTestHttpApi, requestJson, type TestHttpApiSetup } from '../helpers/http.js';
import { createTestHost } from '../helpers/business-backend.js';
import { collectingLogger } from '../helpers/persistence.js';
import { ROOM_CODE_LENGTH, isValidRoomCodeFormat } from '../../src/shared.js';
import type { ApiErrorPayload, CreateRoomResponseBody } from '../../src/shared.js';

describe('POST /api/rooms', () => {
  let setup: TestHttpApiSetup;

  beforeEach(async () => {
    setup = await startTestHttpApi();
  });
  afterEach(async () => {
    await setup.close();
  });

  /** Every positive-path test uses the pre-registered, pre-owning `setup.defaultHost` (see helpers/http.ts) — this is the "authenticated + owns an active game" case. */
  function createRoom() {
    return requestJson<CreateRoomResponseBody>(`${setup.baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { Cookie: setup.defaultHost.cookieHeader },
      body: JSON.stringify({ gameSlug: setup.defaultGameSlug }),
    });
  }

  it('1. returns a real, normalized room code', async () => {
    const res = await createRoom();
    expect(res.status).toBe(201);
    expect(res.body.roomCode).toHaveLength(ROOM_CODE_LENGTH);
    expect(isValidRoomCodeFormat(res.body.roomCode)).toBe(true);
  });

  it('2. creates a valid, resolvable host session', async () => {
    const res = await createRoom();
    const record = await setup.repos.sessionRepo.resolveHostSession(res.body.hostSessionToken);
    expect(record).not.toBeNull();
  });

  it('3. persists the room and host session, and returns a safe initial LOBBY TvView', async () => {
    const res = await createRoom();

    const roomId = await setup.repos.roomLookupRepo.resolveRoomCode(res.body.roomCode);
    expect(roomId).not.toBeNull();

    const persistedRoom = await setup.repos.roomStateRepo.load(roomId!);
    const persistedPriv = await setup.repos.roomPrivateStateRepo.load(roomId!);
    expect(persistedRoom?.roomCode).toBe(res.body.roomCode);
    expect(persistedPriv).not.toBeNull();
    // The durable host<->User link is set, but never exposed in the public TvView.
    expect(persistedRoom?.host.hostUserId).toBe(setup.defaultHost.userId);

    expect(res.body.tv.roomCode).toBe(res.body.roomCode);
    expect(res.body.tv.phase.state).toBe('LOBBY');
    expect(res.body.tv.players).toEqual([]);
  });

  it('two consecutive creates never collide on room code', async () => {
    const first = await createRoom();
    const second = await createRoom();
    expect(first.body.roomCode).not.toBe(second.body.roomCode);
    expect(first.body.hostSessionToken).not.toBe(second.body.hostSessionToken);
  });

  it('12 & 13. never returns raw RoomState or RoomPrivateState fields (and never the host User id/email)', async () => {
    const res = await createRoom();
    const raw = JSON.stringify(res.body);
    for (const forbidden of [
      'stateVersion',
      'matchLog',
      'currentPhaseSubmissions',
      'roundHistory',
      'currentCorruptionChoices',
      '"role"',
      'sessionToken',
      setup.defaultHost.userId,
      setup.defaultHost.email,
    ]) {
      expect(raw).not.toContain(forbidden);
    }
  });

  it('14. never logs the host session token', async () => {
    const { logger, entries } = collectingLogger();
    const loggedSetup = await startTestHttpApi({ logger });
    const res = await requestJson<CreateRoomResponseBody>(`${loggedSetup.baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { Cookie: loggedSetup.defaultHost.cookieHeader },
      body: JSON.stringify({ gameSlug: loggedSetup.defaultGameSlug }),
    });
    expect(JSON.stringify(entries)).not.toContain(res.body.hostSessionToken);
    await loggedSetup.close();
  });

  // ---- Permanent Business Backend: authorization gate (PART 6/7/13) --------------------------

  describe('authorization', () => {
    it('an unauthenticated request is rejected — no Cookie header at all', async () => {
      const res = await requestJson<ApiErrorPayload>(`${setup.baseUrl}/api/rooms`, {
        method: 'POST',
        body: JSON.stringify({ gameSlug: setup.defaultGameSlug }),
      });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });

    it('an invalid/garbage session cookie is rejected the same way as no cookie', async () => {
      const res = await requestJson<ApiErrorPayload>(`${setup.baseUrl}/api/rooms`, {
        method: 'POST',
        headers: { Cookie: 'jackom_session=not-a-real-token' },
        body: JSON.stringify({ gameSlug: setup.defaultGameSlug }),
      });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });

    it('a real, authenticated User who does NOT own the game is rejected', async () => {
      // Register without granting any ownership at all — the plain "logged in, owns nothing" case.
      const { user, rawToken } = await setup.business.authService.register(
        'no-owner@example.test',
        'correct horse battery staple',
        'بلا ملكية',
      );
      const nonOwner = { userId: user.id, email: user.email, cookieHeader: `jackom_session=${rawToken}` };
      const res = await requestJson<ApiErrorPayload>(`${setup.baseUrl}/api/rooms`, {
        method: 'POST',
        headers: { Cookie: nonOwner.cookieHeader },
        body: JSON.stringify({ gameSlug: setup.defaultGameSlug }),
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('GAME_NOT_OWNED');
    });

    it('a Game that does not exist is rejected with GAME_NOT_FOUND', async () => {
      const res = await requestJson<ApiErrorPayload>(`${setup.baseUrl}/api/rooms`, {
        method: 'POST',
        headers: { Cookie: setup.defaultHost.cookieHeader },
        body: JSON.stringify({ gameSlug: 'does-not-exist' }),
      });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('GAME_NOT_FOUND');
    });

    it('an inactive Game is rejected even for its real owner', async () => {
      setup.business.repos.gameRepo.seed({ slug: 'retired-game', isActive: false });
      const owner = await createTestHost(setup.business, 'retired-game');
      const res = await requestJson<ApiErrorPayload>(`${setup.baseUrl}/api/rooms`, {
        method: 'POST',
        headers: { Cookie: owner.cookieHeader },
        body: JSON.stringify({ gameSlug: 'retired-game' }),
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('GAME_NOT_ACTIVE');
    });

    it('a missing gameSlug in the request body is a plain 400, not an auth error', async () => {
      const res = await requestJson<ApiErrorPayload>(`${setup.baseUrl}/api/rooms`, {
        method: 'POST',
        headers: { Cookie: setup.defaultHost.cookieHeader },
        body: '{}',
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_REQUEST');
    });

    it('every rejected create-room attempt leaves NO Redis room behind', async () => {
      const createRoomSpy = vi.spyOn(setup.manager, 'createRoom');

      const attempts = [
        () => requestJson(`${setup.baseUrl}/api/rooms`, { method: 'POST', body: JSON.stringify({ gameSlug: setup.defaultGameSlug }) }),
        () =>
          requestJson(`${setup.baseUrl}/api/rooms`, {
            method: 'POST',
            headers: { Cookie: setup.defaultHost.cookieHeader },
            body: JSON.stringify({ gameSlug: 'does-not-exist' }),
          }),
        () =>
          requestJson(`${setup.baseUrl}/api/rooms`, {
            method: 'POST',
            headers: { Cookie: setup.defaultHost.cookieHeader },
            body: '{}',
          }),
      ];
      for (const attempt of attempts) {
        const res = await attempt();
        expect(res.status).toBeGreaterThanOrEqual(400);
      }
      // The one function call that actually persists Redis room state — never reached for any
      // rejected attempt above.
      expect(createRoomSpy).not.toHaveBeenCalled();
    });
  });
});
