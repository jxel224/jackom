// Real PostgreSQL + real Redis + a real HttpApiServer — the closest thing to the actual production
// wiring this test suite has. Covers PART 13's Room Creation + Guest Join matrix, PART 14's
// Redis/Postgres boundary proof, and PART 15's restart-survival check. Skipped entirely (not
// failed) if either real Redis or real Postgres isn't reachable, matching
// test/persistence/redis-integration.test.ts's existing "optional, real-infra" pattern — the main
// suite never depends on either being up.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import Redis from 'ioredis';
import { createTestDeps } from '../helpers/test-deps.js';
import { requestJson } from '../helpers/http.js';
import { RoomActorManager } from '../../src/actors/room-actor-manager.js';
import { HttpApiServer } from '../../src/http/http-api-server.js';
import { RedisKeyValueStore } from '../../src/persistence/redis-kv-store.js';
import { KeyValueRoomStateRepository } from '../../src/persistence/room-state-repo.js';
import { KeyValueRoomPrivateStateRepository } from '../../src/persistence/room-private-state-repo.js';
import { KeyValueRoomLookupRepository } from '../../src/persistence/room-lookup-repo.js';
import { KeyValueSessionRepository } from '../../src/persistence/session-repo.js';
import { createTestPrismaClient, resetTestDatabase } from './test-db.js';
import type { PrismaClient } from '../../src/db/client.js';
import { PrismaUserRepository } from '../../src/db/repositories/user-repository.js';
import { PrismaGameRepository } from '../../src/db/repositories/game-repository.js';
import { PrismaOwnershipRepository } from '../../src/db/repositories/ownership-repository.js';
import { PrismaAuthSessionRepository } from '../../src/db/repositories/auth-session-repository.js';
import { AuthService, toSafeUser } from '../../src/db/services/auth-service.js';
import { OwnershipService } from '../../src/db/services/ownership-service.js';
import { SESSION_COOKIE_NAME } from '../../src/http/cookies.js';
import type { ApiErrorPayload, CreateRoomResponseBody, JoinRoomResponseBody } from '../../src/shared.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

async function probeRedis(): Promise<Redis | null> {
  const candidate = new Redis(REDIS_URL, { lazyConnect: true, retryStrategy: () => null, connectTimeout: 500 });
  candidate.on('error', () => {});
  try {
    await candidate.connect();
    await candidate.ping();
    return candidate;
  } catch {
    candidate.disconnect();
    return null;
  }
}

let prisma: PrismaClient | null = null;
try {
  prisma = createTestPrismaClient();
  await prisma.$queryRaw`SELECT 1`;
} catch {
  await prisma?.$disconnect().catch(() => {});
  prisma = null;
}

const redisClient = await probeRedis();

describe.skipIf(redisClient === null || prisma === null)('Room authorization + Redis/Postgres boundary (real infra)', () => {
  let authService: AuthService;
  let ownershipService: OwnershipService;

  beforeAll(() => {
    authService = new AuthService(new PrismaUserRepository(prisma!), new PrismaAuthSessionRepository(prisma!), {
      sessionTokenSecret: 'test-only-session-secret',
      sessionTtlSeconds: 3600,
      bcryptRounds: 4,
    });
    ownershipService = new OwnershipService(new PrismaGameRepository(prisma!), new PrismaOwnershipRepository(prisma!));
  });
  afterEach(async () => {
    await resetTestDatabase(prisma!);
  });
  afterAll(async () => {
    await prisma?.$disconnect();
    await redisClient?.quit();
  });

  async function buildServer(seed: number) {
    const deps = createTestDeps(seed);
    const store = new RedisKeyValueStore(redisClient!);
    const repos = {
      roomStateRepo: new KeyValueRoomStateRepository(store, 60),
      roomPrivateStateRepo: new KeyValueRoomPrivateStateRepository(store, 60),
      roomLookupRepo: new KeyValueRoomLookupRepository(store, 60),
      sessionRepo: new KeyValueSessionRepository(store, 60),
    };
    const manager = new RoomActorManager({
      fsmDeps: deps,
      roomStateRepo: repos.roomStateRepo,
      roomPrivateStateRepo: repos.roomPrivateStateRepo,
      roomLookupRepo: repos.roomLookupRepo,
      sessionRepo: repos.sessionRepo,
    });
    const server = new HttpApiServer({
      roomActorManager: manager,
      roomLookupRepo: repos.roomLookupRepo,
      sessionRepo: repos.sessionRepo,
      fsmDeps: deps,
      authService,
      ownershipService,
    });
    const port = await server.listen(0);
    return { baseUrl: `http://127.0.0.1:${port}`, repos, manager, close: () => server.close() };
  }

  async function registerAndOwn(gameSlug: string, emailSuffix: string) {
    const { user, rawToken } = await authService.register(`${emailSuffix}@example.test`, 'a real password 123456', 'مضيف');
    await ownershipService.grantOwnership(user.id, gameSlug);
    return { userId: user.id, cookieHeader: `${SESSION_COOKIE_NAME}=${rawToken}` };
  }

  describe('PART 13 — Room Creation matrix, over real HTTP + real Postgres + real Redis', () => {
    it('authenticated + owns HACKERS: ALLOW', async () => {
      const server = await buildServer(801);
      await prisma!.game.create({ data: { slug: 'hackers', name: 'لعبة الهاكر', isActive: true } });
      const host = await registerAndOwn('hackers', 'allow-host');

      const res = await requestJson<CreateRoomResponseBody>(`${server.baseUrl}/api/rooms`, {
        method: 'POST',
        headers: { Cookie: host.cookieHeader },
        body: JSON.stringify({ gameSlug: 'hackers' }),
      });
      expect(res.status).toBe(201);
      await server.close();
    });

    it('authenticated + does NOT own HACKERS: REJECT', async () => {
      const server = await buildServer(802);
      await prisma!.game.create({ data: { slug: 'hackers', name: 'لعبة الهاكر', isActive: true } });
      const { rawToken } = await authService.register('no-owner@example.test', 'a real password 123456', 'بلا ملكية');

      const res = await requestJson<ApiErrorPayload>(`${server.baseUrl}/api/rooms`, {
        method: 'POST',
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${rawToken}` },
        body: JSON.stringify({ gameSlug: 'hackers' }),
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('GAME_NOT_OWNED');
      await server.close();
    });

    it('unauthenticated: REJECT', async () => {
      const server = await buildServer(803);
      await prisma!.game.create({ data: { slug: 'hackers', name: 'لعبة الهاكر', isActive: true } });

      const res = await requestJson<ApiErrorPayload>(`${server.baseUrl}/api/rooms`, {
        method: 'POST',
        body: JSON.stringify({ gameSlug: 'hackers' }),
      });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
      await server.close();
    });

    it('authenticated + owns an INACTIVE game: REJECT', async () => {
      const server = await buildServer(804);
      await prisma!.game.create({ data: { slug: 'retired', name: 'Retired', isActive: false } });
      const host = await registerAndOwn('retired', 'inactive-owner');

      const res = await requestJson<ApiErrorPayload>(`${server.baseUrl}/api/rooms`, {
        method: 'POST',
        headers: { Cookie: host.cookieHeader },
        body: JSON.stringify({ gameSlug: 'retired' }),
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('GAME_NOT_ACTIVE');
      await server.close();
    });

    it('a rejected create-room leaves NO Redis room behind', async () => {
      const server = await buildServer(805);
      await prisma!.game.create({ data: { slug: 'hackers', name: 'لعبة الهاكر', isActive: true } });
      const before = await redisClient!.dbsize();

      await requestJson(`${server.baseUrl}/api/rooms`, { method: 'POST', body: JSON.stringify({ gameSlug: 'hackers' }) });

      const after = await redisClient!.dbsize();
      expect(after).toBe(before);
      await server.close();
    });
  });

  describe('PART 13 — Guest Join regression: unaffected by any of this', () => {
    it('a guest with NO account can join an authorized, already-created room', async () => {
      const server = await buildServer(806);
      await prisma!.game.create({ data: { slug: 'hackers', name: 'لعبة الهاكر', isActive: true } });
      const host = await registerAndOwn('hackers', 'guest-flow-host');

      const created = await requestJson<CreateRoomResponseBody>(`${server.baseUrl}/api/rooms`, {
        method: 'POST',
        headers: { Cookie: host.cookieHeader },
        body: JSON.stringify({ gameSlug: 'hackers' }),
      });

      // No Cookie header at all — a guest never authenticates.
      const joined = await requestJson<JoinRoomResponseBody>(`${server.baseUrl}/api/rooms/${created.body.roomCode}/players`, {
        method: 'POST',
        body: JSON.stringify({ displayName: 'ضيف' }),
      });
      expect(joined.status).toBe(201);
      expect(joined.body.view.self.name).toBe('ضيف');
      await server.close();
    });
  });

  describe('PART 14 — PostgreSQL and Redis boundary stays clean', () => {
    it('a User + ownership in Postgres, a room + Player in Redis, and the two never cross-contaminate', async () => {
      const server = await buildServer(807);
      await prisma!.game.create({ data: { slug: 'hackers', name: 'لعبة الهاكر', isActive: true } });
      const host = await registerAndOwn('hackers', 'boundary-host');

      // 1-4: create User, grant ownership, authenticate, create room.
      const created = await requestJson<CreateRoomResponseBody>(`${server.baseUrl}/api/rooms`, {
        method: 'POST',
        headers: { Cookie: host.cookieHeader },
        body: JSON.stringify({ gameSlug: 'hackers' }),
      });
      expect(created.status).toBe(201);

      // 5: room exists in Redis.
      const roomId = await server.repos.roomLookupRepo.resolveRoomCode(created.body.roomCode);
      expect(roomId).not.toBeNull();
      const persistedRoom = await server.repos.roomStateRepo.load(roomId!);
      expect(persistedRoom).not.toBeNull();
      expect(persistedRoom!.host.hostUserId).toBe(host.userId); // the durable link IS there…

      // 6: a temporary Player joins.
      const joined = await requestJson<JoinRoomResponseBody>(`${server.baseUrl}/api/rooms/${created.body.roomCode}/players`, {
        method: 'POST',
        body: JSON.stringify({ displayName: 'لاعبة مؤقتة' }),
      });
      expect(joined.status).toBe(201);

      // 7: Player role/live state is NEVER persisted as a permanent User record — no User row was
      // ever created for this Player at all (guests never touch Postgres, confirmed by count staying at exactly 1 — the host).
      const userCount = await prisma!.user.count();
      expect(userCount).toBe(1);
      const playerNameLeakedIntoPostgres = await prisma!.user.findFirst({ where: { displayName: 'لاعبة مؤقتة' } });
      expect(playerNameLeakedIntoPostgres).toBeNull();

      // 8: delete/expire the room (Redis).
      await server.repos.roomStateRepo.delete(roomId!);
      await server.repos.roomLookupRepo.deleteRoomCode(created.body.roomCode);
      expect(await server.repos.roomStateRepo.load(roomId!)).toBeNull();

      // 9: the User + ownership still exist in PostgreSQL, completely unaffected by the Redis room's deletion.
      const stillThere = await prisma!.user.findUnique({ where: { id: host.userId } });
      expect(stillThere).not.toBeNull();
      await expect(ownershipService.requireOwnedActiveGame(host.userId, 'hackers')).resolves.toBeTruthy();

      await server.close();
    });

    it('the TvView/PlayerView the HTTP API returns never contains the host User id or email — only what live gameplay needs', async () => {
      const server = await buildServer(808);
      await prisma!.game.create({ data: { slug: 'hackers', name: 'لعبة الهاكر', isActive: true } });
      const host = await registerAndOwn('hackers', 'privacy-host');

      const created = await requestJson<CreateRoomResponseBody>(`${server.baseUrl}/api/rooms`, {
        method: 'POST',
        headers: { Cookie: host.cookieHeader },
        body: JSON.stringify({ gameSlug: 'hackers' }),
      });
      const raw = JSON.stringify(created.body);
      expect(raw).not.toContain(host.userId);
      expect(raw).not.toContain('privacy-host@example.test');
      await server.close();
    });
  });

  describe('PART 15 — restart survival', () => {
    it('User + GameOwnership + the Game catalog all survive a simulated process restart (fresh PrismaClient, same database)', async () => {
      await prisma!.game.create({ data: { slug: 'hackers', name: 'لعبة الهاكر', isActive: true } });
      const host = await registerAndOwn('hackers', 'restart-host');

      // Simulate "the process restarted": disconnect this client, connect a brand-new one — nothing
      // about the User/ownership can depend on any in-memory state from the old connection.
      const freshPrisma = createTestPrismaClient();
      try {
        const user = await freshPrisma.user.findUnique({ where: { id: host.userId } });
        expect(user).not.toBeNull();
        const ownership = await freshPrisma.gameOwnership.findFirst({ where: { userId: host.userId } });
        expect(ownership).not.toBeNull();
        const game = await freshPrisma.game.findUnique({ where: { slug: 'hackers' } });
        expect(game?.isActive).toBe(true);

        // A restart must never grant unauthorized ownership either — a second, never-granted User still isn't an owner.
        const strangerRepo = new PrismaUserRepository(freshPrisma);
        const stranger = await strangerRepo.create({ email: 'stranger-after-restart@example.test', passwordHash: 'x', displayName: 'y' });
        const freshOwnershipService = new OwnershipService(new PrismaGameRepository(freshPrisma), new PrismaOwnershipRepository(freshPrisma));
        await expect(freshOwnershipService.requireOwnedActiveGame(stranger.id, 'hackers')).rejects.toMatchObject({ code: 'GAME_NOT_OWNED' });
      } finally {
        await freshPrisma.$disconnect();
      }
    });

    it('a still-valid session survives being looked up through a completely fresh PrismaClient/repository stack', async () => {
      const { rawToken } = await authService.register('session-restart@example.test', 'a real password 123456', 'جلسة');
      const freshPrisma = createTestPrismaClient();
      try {
        const freshAuthService = new AuthService(new PrismaUserRepository(freshPrisma), new PrismaAuthSessionRepository(freshPrisma), {
          sessionTokenSecret: 'test-only-session-secret', // must match what issued the token
          sessionTtlSeconds: 3600,
        });
        const resolved = await freshAuthService.requireSession(rawToken);
        expect(toSafeUser(resolved).email).toBe('session-restart@example.test');
      } finally {
        await freshPrisma.$disconnect();
      }
    });
  });
});
