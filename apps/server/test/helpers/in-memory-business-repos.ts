// In-memory implementations of the Permanent Business Backend's repository interfaces — mirrors
// this codebase's existing `InMemoryKeyValueStore` pattern (apps/server/src/persistence/) so HTTP
// tests that just need "a room to exist" (rate limiting, CORS, WS wiring, availability) don't need a
// real Postgres connection. Real Prisma-backed integration tests live in apps/server/test/db/ and
// use the actual PrismaUserRepository/etc against TEST_DATABASE_URL — these are for everything else.
import { randomUUID } from 'node:crypto';
import type { CreateUserInput, UserRecord, UserRepository } from '../../src/db/repositories/user-repository.js';
import type { GameRecord, GameRepository } from '../../src/db/repositories/game-repository.js';
import type { OwnershipRepository } from '../../src/db/repositories/ownership-repository.js';
import type { CreateAuthSessionInput, AuthSessionRepository } from '../../src/db/repositories/auth-session-repository.js';
import { ApiError, ApiErrors } from '../../src/http/errors.js';

export class InMemoryUserRepository implements UserRepository {
  private readonly byId = new Map<string, UserRecord>();

  async create(input: CreateUserInput): Promise<UserRecord> {
    for (const existing of this.byId.values()) {
      if (existing.email === input.email) throw ApiErrors.emailAlreadyRegistered();
    }
    const now = new Date();
    const user: UserRecord = { id: randomUUID(), ...input, createdAt: now, updatedAt: now };
    this.byId.set(user.id, user);
    return user;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    for (const user of this.byId.values()) if (user.email === email) return user;
    return null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    return this.byId.get(id) ?? null;
  }
}

export class InMemoryGameRepository implements GameRepository {
  private readonly bySlug = new Map<string, GameRecord>();

  /** Test-only convenience, not part of the real `GameRepository` interface. */
  seed(overrides: Partial<GameRecord> = {}): GameRecord {
    const now = new Date();
    const game: GameRecord = {
      id: randomUUID(),
      slug: 'hackers',
      name: 'لعبة الهاكر',
      isActive: true,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
    this.bySlug.set(game.slug, game);
    return game;
  }

  async findBySlug(slug: string): Promise<GameRecord | null> {
    return this.bySlug.get(slug) ?? null;
  }

  async findById(id: string): Promise<GameRecord | null> {
    for (const game of this.bySlug.values()) if (game.id === id) return game;
    return null;
  }
}

export class InMemoryOwnershipRepository implements OwnershipRepository {
  private readonly grants = new Set<string>(); // `${userId}:${gameId}`
  constructor(private readonly gameRepo: InMemoryGameRepository) {}

  private key(userId: string, gameId: string): string {
    return `${userId}:${gameId}`;
  }

  async isOwned(userId: string, gameId: string): Promise<boolean> {
    return this.grants.has(this.key(userId, gameId));
  }

  async grant(userId: string, gameId: string): Promise<void> {
    const key = this.key(userId, gameId);
    if (this.grants.has(key)) throw new ApiError(409, 'INVALID_REQUEST', 'هذا المستخدم يملك هذه اللعبة بالفعل.');
    this.grants.add(key);
  }

  async listOwnedGames(userId: string): Promise<GameRecord[]> {
    const games: GameRecord[] = [];
    for (const key of this.grants) {
      const [ownerId, gameId] = key.split(':');
      if (ownerId !== userId) continue;
      const game = await this.gameRepo.findById(gameId!);
      if (game) games.push(game);
    }
    return games;
  }
}

export class InMemoryAuthSessionRepository implements AuthSessionRepository {
  private readonly byTokenHash = new Map<string, { userId: string; expiresAt: Date }>();
  constructor(private readonly userRepo: InMemoryUserRepository) {}

  async create(input: CreateAuthSessionInput): Promise<void> {
    this.byTokenHash.set(input.tokenHash, { userId: input.userId, expiresAt: input.expiresAt });
  }

  async findValidByTokenHash(tokenHash: string): Promise<UserRecord | null> {
    const session = this.byTokenHash.get(tokenHash);
    if (!session || session.expiresAt.getTime() <= Date.now()) return null;
    return this.userRepo.findById(session.userId);
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    this.byTokenHash.delete(tokenHash);
  }
}

export interface InMemoryBusinessRepos {
  userRepo: InMemoryUserRepository;
  gameRepo: InMemoryGameRepository;
  ownershipRepo: InMemoryOwnershipRepository;
  authSessionRepo: InMemoryAuthSessionRepository;
}

export function buildInMemoryBusinessRepos(): InMemoryBusinessRepos {
  const userRepo = new InMemoryUserRepository();
  const gameRepo = new InMemoryGameRepository();
  return {
    userRepo,
    gameRepo,
    ownershipRepo: new InMemoryOwnershipRepository(gameRepo),
    authSessionRepo: new InMemoryAuthSessionRepository(userRepo),
  };
}
