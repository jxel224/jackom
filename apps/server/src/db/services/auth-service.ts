import { randomBytes, createHmac } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { SafeUser } from '../../shared.js';
import { ApiErrors } from '../../http/errors.js';
import { UserRepository, type UserRecord } from '../repositories/user-repository.js';
import { AuthSessionRepository } from '../repositories/auth-session-repository.js';

export interface AuthServiceOptions {
  /** HMAC key for hashing session tokens before they're stored — never the raw token (see Session model doc comment). */
  sessionTokenSecret: string;
  sessionTtlSeconds: number;
  /**
   * bcrypt cost factor. Defaults to a real-world-appropriate 10. Tests inject a much lower value
   * (see test/helpers/db.ts) so hundreds of register/login assertions stay fast WITHOUT the
   * production code path ever using a weakened value — the exact "realistic hashing that isn't
   * painfully slow in tests" requirement, solved by injection rather than by cutting corners in
   * the algorithm itself.
   */
  bcryptRounds?: number;
}

export interface IssuedSession {
  user: UserRecord;
  rawToken: string;
  expiresAt: Date;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Never returns `passwordHash` — the one function every route handler uses before a User ever reaches a response body. */
export function toSafeUser(user: UserRecord): SafeUser {
  return { id: user.id, email: user.email, displayName: user.displayName, createdAt: user.createdAt.toISOString() };
}

/**
 * Owns everything password/session-shaped. Repositories below it are dumb Prisma wrappers; this is
 * the one place that knows what "a valid login" or "a valid session" actually means.
 */
export class AuthService {
  private readonly bcryptRounds: number;

  constructor(
    private readonly userRepo: UserRepository,
    private readonly authSessionRepo: AuthSessionRepository,
    private readonly options: AuthServiceOptions,
  ) {
    this.bcryptRounds = options.bcryptRounds ?? 10;
  }

  private hashToken(rawToken: string): string {
    return createHmac('sha256', this.options.sessionTokenSecret).update(rawToken).digest('hex');
  }

  private async issueSession(user: UserRecord): Promise<IssuedSession> {
    const rawToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.options.sessionTtlSeconds * 1000);
    await this.authSessionRepo.create({ tokenHash: this.hashToken(rawToken), userId: user.id, expiresAt });
    return { user, rawToken, expiresAt };
  }

  async register(email: string, password: string, displayName: string): Promise<IssuedSession> {
    const passwordHash = await bcrypt.hash(password, this.bcryptRounds);
    const user = await this.userRepo.create({ email: normalizeEmail(email), passwordHash, displayName });
    return this.issueSession(user);
  }

  async login(email: string, password: string): Promise<IssuedSession> {
    const user = await this.userRepo.findByEmail(normalizeEmail(email));
    // Deliberately the SAME rejection for "no such account" and "wrong password" (PART 20) —
    // bcrypt.compare still runs against a real hash either way (a fixed dummy hash when the account
    // doesn't exist) so the response time doesn't leak account existence via a timing side-channel.
    const passwordHash = user?.passwordHash ?? '$2a$10$CwTycUXWue0Thq9StjUM0uJ8i6VOZ9r0EExWLpaHbdU7bR1z8L3Yq';
    const matches = await bcrypt.compare(password, passwordHash);
    if (!user || !matches) throw ApiErrors.invalidCredentials();
    return this.issueSession(user);
  }

  async logout(rawToken: string): Promise<void> {
    await this.authSessionRepo.deleteByTokenHash(this.hashToken(rawToken));
  }

  /** Returns the authenticated User, or throws UNAUTHENTICATED — every caller that needs "logged in or reject" uses this, never a bare null-check they might forget. */
  async requireSession(rawToken: string | null): Promise<UserRecord> {
    if (!rawToken) throw ApiErrors.unauthenticated();
    const user = await this.authSessionRepo.findValidByTokenHash(this.hashToken(rawToken));
    if (!user) throw ApiErrors.unauthenticated();
    return user;
  }
}
