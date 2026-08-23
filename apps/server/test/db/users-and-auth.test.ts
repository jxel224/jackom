// Real PostgreSQL integration coverage for Users + Authentication (PART 13) — every repository and
// service here is the REAL Prisma-backed implementation against a real, separate test database
// (never the in-memory test fakes other HTTP-layer tests use for speed/isolation from Postgres).
import { createHmac } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestPrismaClient, resetTestDatabase } from './test-db.js';
import type { PrismaClient } from '../../src/db/client.js';
import { PrismaUserRepository } from '../../src/db/repositories/user-repository.js';
import { PrismaAuthSessionRepository } from '../../src/db/repositories/auth-session-repository.js';
import { AuthService, toSafeUser } from '../../src/db/services/auth-service.js';
import { ApiError } from '../../src/http/errors.js';

let prisma: PrismaClient;
let authService: AuthService;

beforeAll(() => {
  prisma = createTestPrismaClient();
  authService = new AuthService(new PrismaUserRepository(prisma), new PrismaAuthSessionRepository(prisma), {
    sessionTokenSecret: 'test-only-session-secret',
    sessionTtlSeconds: 3600,
    bcryptRounds: 4, // real bcrypt, cheap cost so this file stays fast — see PERMANENT_BACKEND_FOUNDATION_REPORT.md
  });
});
afterEach(async () => {
  await resetTestDatabase(prisma);
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('Users (real PostgreSQL)', () => {
  it('creates a real User row with a stable generated id and timestamps', async () => {
    const { user } = await authService.register('alice@example.test', 'correct horse battery staple', 'أليس');
    expect(user.id).toBeTruthy();
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);

    const row = await prisma.user.findUnique({ where: { id: user.id } });
    expect(row).not.toBeNull();
  });

  it('enforces unique email at the DATABASE level, not merely in application code', async () => {
    await authService.register('bob@example.test', 'correct horse battery staple', 'بوب');
    // Bypass AuthService entirely — insert directly via Prisma to prove the CONSTRAINT itself rejects it, not just AuthService's own pre-check.
    await expect(prisma.user.create({ data: { email: 'bob@example.test', passwordHash: 'x', displayName: 'y' } })).rejects.toThrow();
  });

  it('normalizes email (trim + lowercase) before storage — a differently-cased duplicate is still rejected', async () => {
    await authService.register('Carol@Example.Test', 'correct horse battery staple', 'كارول');
    const stored = await prisma.user.findUnique({ where: { email: 'carol@example.test' } });
    expect(stored).not.toBeNull();
    await expect(authService.register('  carol@example.test  ', 'another password 1234', 'كارول 2')).rejects.toThrow(ApiError);
  });

  it('never stores a plaintext password, and the safe User projection never includes the hash', async () => {
    const { user } = await authService.register('dave@example.test', 'a very real password 123', 'ديف');
    const row = await prisma.user.findUnique({ where: { id: user.id } });
    expect(row!.passwordHash).not.toBe('a very real password 123');
    expect(row!.passwordHash).toMatch(/^\$2[aby]\$/); // real bcrypt hash shape

    const safe = toSafeUser(user);
    expect(JSON.stringify(safe)).not.toContain('passwordHash');
    expect(Object.keys(safe)).not.toContain('passwordHash');
  });
});

describe('Authentication (real PostgreSQL)', () => {
  it('registers a valid account and issues a real session', async () => {
    const { user, rawToken } = await authService.register('erin@example.test', 'correct horse battery staple', 'إيرين');
    expect(rawToken).toHaveLength(64); // 32 random bytes, hex-encoded
    const resolved = await authService.requireSession(rawToken);
    expect(resolved.id).toBe(user.id);
  });

  it('duplicate registration is rejected (EMAIL_ALREADY_REGISTERED)', async () => {
    await authService.register('frank@example.test', 'correct horse battery staple', 'فرانك');
    await expect(authService.register('frank@example.test', 'a different password 987', 'فرانك 2')).rejects.toMatchObject({ code: 'EMAIL_ALREADY_REGISTERED' });
  });

  it('login with the correct password succeeds and issues a working session', async () => {
    await authService.register('grace@example.test', 'the correct password 111', 'غريس');
    const { rawToken } = await authService.login('grace@example.test', 'the correct password 111');
    const resolved = await authService.requireSession(rawToken);
    expect(resolved.email).toBe('grace@example.test');
  });

  it('login with the wrong password is rejected (INVALID_CREDENTIALS)', async () => {
    await authService.register('heidi@example.test', 'the correct password 222', 'هايدي');
    await expect(authService.login('heidi@example.test', 'the WRONG password 222')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('login for an unknown account is rejected the SAME way as a wrong password (no enumeration signal)', async () => {
    let unknownError: unknown;
    let wrongPasswordError: unknown;
    await authService.register('ivan@example.test', 'the correct password 333', 'إيفان');
    try {
      await authService.login('nobody-registered@example.test', 'whatever');
    } catch (e) {
      unknownError = e;
    }
    try {
      await authService.login('ivan@example.test', 'the WRONG password 333');
    } catch (e) {
      wrongPasswordError = e;
    }
    expect((unknownError as ApiError).code).toBe((wrongPasswordError as ApiError).code);
    expect((unknownError as ApiError).status).toBe((wrongPasswordError as ApiError).status);
    expect((unknownError as ApiError).message).toBe((wrongPasswordError as ApiError).message);
  });

  it('a valid session resolves via requireSession ("/me works")', async () => {
    const { rawToken, user } = await authService.register('judy@example.test', 'the correct password 444', 'جودي');
    const resolved = await authService.requireSession(rawToken);
    expect(resolved.id).toBe(user.id);
  });

  it('no session / a garbage token is rejected ("unauthenticated /me rejected")', async () => {
    await expect(authService.requireSession(null)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(authService.requireSession('not-a-real-token')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('logout invalidates the session — it can never be used again afterward', async () => {
    const { rawToken } = await authService.register('mallory@example.test', 'the correct password 555', 'مالوري');
    await authService.requireSession(rawToken); // works before logout
    await authService.logout(rawToken);
    await expect(authService.requireSession(rawToken)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('an expired session is rejected exactly like an invalid one', async () => {
    const { user } = await authService.register('oscar@example.test', 'the correct password 666', 'أوسكار');
    // Issue a session that's already expired, bypassing AuthService's own TTL — proves the
    // REPOSITORY's own expiry check, not merely AuthService trusting a fresh token.
    const repo = new PrismaAuthSessionRepository(prisma);
    const expiredToken = 'expired-raw-token-for-this-test-only';
    const tokenHash = createHmac('sha256', 'test-only-session-secret').update(expiredToken).digest('hex');
    await repo.create({ tokenHash, userId: user.id, expiresAt: new Date(Date.now() - 1000) });
    await expect(authService.requireSession(expiredToken)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});
