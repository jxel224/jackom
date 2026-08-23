import type { PrismaClient } from '../client.js';
import type { UserRecord } from './user-repository.js';

export interface CreateAuthSessionInput {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
}

/**
 * The permanent account's login session (PostgreSQL-backed) — NOT the same thing as the existing
 * Redis-backed `SessionRepository`/`HostSessionRecord`/`PlayerSessionRecord`
 * (apps/server/src/persistence/session-repo.ts), which are short-lived, per-room realtime gameplay
 * reconnect tokens. Named `AuthSessionRepository` specifically so nobody ever confuses the two.
 */
export interface AuthSessionRepository {
  create(input: CreateAuthSessionInput): Promise<void>;
  /** Returns the session's owning User only if the token hash matches AND the session hasn't expired. */
  findValidByTokenHash(tokenHash: string): Promise<UserRecord | null>;
  deleteByTokenHash(tokenHash: string): Promise<void>;
}

export class PrismaAuthSessionRepository implements AuthSessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateAuthSessionInput): Promise<void> {
    await this.prisma.session.create({ data: input });
  }

  async findValidByTokenHash(tokenHash: string): Promise<UserRecord | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!session || session.expiresAt.getTime() <= Date.now()) return null;
    return session.user;
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { tokenHash } });
  }
}
