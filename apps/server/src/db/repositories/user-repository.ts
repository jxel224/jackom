import type { PrismaClient } from '../client.js';
import { ApiErrors } from '../../http/errors.js';
import { isUniqueConstraintViolation } from '../prisma-errors.js';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName: string;
}

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Interface + Prisma implementation, mirroring this codebase's existing `KeyValueStore` /
 * `RedisKeyValueStore` / `InMemoryKeyValueStore` split (apps/server/src/persistence/) — the same
 * shape lets tests that don't care about Postgres specifically use a fast in-memory fake
 * (test/helpers/in-memory-business-repos.ts) instead of requiring a real database for every HTTP
 * test that merely needs "a room to exist," while `AuthService`/`OwnershipService` themselves never
 * know or care which implementation they're holding.
 */
export interface UserRepository {
  create(input: CreateUserInput): Promise<UserRecord>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
}

/** No business logic (hashing, session issuance) lives here, only auth-service.ts does. `email` is always already normalized (lowercased/trimmed) by the caller. */
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateUserInput): Promise<UserRecord> {
    try {
      return await this.prisma.user.create({ data: input });
    } catch (cause) {
      if (isUniqueConstraintViolation(cause, 'email')) {
        throw ApiErrors.emailAlreadyRegistered();
      }
      throw cause;
    }
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }
}
