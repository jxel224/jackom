// Test-only wiring for the Permanent Business Backend (Users/Auth/Ownership), built on the
// in-memory repos (in-memory-business-repos.ts) — fast, isolated, no real Postgres needed. Real
// Prisma-backed integration coverage lives separately in apps/server/test/db/.
import { AuthService } from '../../src/db/services/auth-service.js';
import { OwnershipService } from '../../src/db/services/ownership-service.js';
import { SESSION_COOKIE_NAME } from '../../src/http/cookies.js';
import { buildInMemoryBusinessRepos, type InMemoryBusinessRepos } from './in-memory-business-repos.js';

export interface TestBusinessBackend {
  repos: InMemoryBusinessRepos;
  authService: AuthService;
  ownershipService: OwnershipService;
}

export function buildTestBusinessBackend(): TestBusinessBackend {
  const repos = buildInMemoryBusinessRepos();
  return {
    repos,
    // bcryptRounds: 4 — real bcrypt, real hashing, just cheap enough that hundreds of assertions
    // across the HTTP test suite stay fast (PART 12: "realistic hashing that isn't painfully slow").
    authService: new AuthService(repos.userRepo, repos.authSessionRepo, {
      sessionTokenSecret: 'test-only-session-secret-not-a-real-secret',
      sessionTtlSeconds: 30 * 24 * 60 * 60,
      bcryptRounds: 4,
    }),
    ownershipService: new OwnershipService(repos.gameRepo, repos.ownershipRepo),
  };
}

export interface TestHost {
  userId: string;
  email: string;
  cookieHeader: string;
}

/**
 * Registers a real User (in-process service call — never an HTTP request, so it never consumes any
 * HTTP-layer rate-limit budget) and grants ownership of the given game slug directly, bypassing
 * Stripe/HTTP entirely (the same "dev/test fixture" path PART 9 sanctions). Returns a ready-to-use
 * `Cookie` header value for a test to attach to its own `requestJson`/`fetch` call under test.
 */
export async function createTestHost(backend: TestBusinessBackend, gameSlug = 'hackers', emailSuffix = Date.now()): Promise<TestHost> {
  const email = `host-${emailSuffix}-${Math.random().toString(36).slice(2)}@example.test`;
  const { user, rawToken } = await backend.authService.register(email, 'correct horse battery staple', 'مضيف الاختبار');
  await backend.ownershipService.grantOwnership(user.id, gameSlug, 'test-fixture');
  return { userId: user.id, email: user.email, cookieHeader: `${SESSION_COOKIE_NAME}=${rawToken}` };
}
