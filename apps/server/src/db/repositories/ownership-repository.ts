import type { PrismaClient } from '../client.js';
import type { GameRecord } from './game-repository.js';
import { ApiError } from '../../http/errors.js';
import { isUniqueConstraintViolation } from '../prisma-errors.js';

export interface OwnershipRepository {
  isOwned(userId: string, gameId: string): Promise<boolean>;
  /** Never reachable from any public HTTP route (PART 9) — only the dev-grant script and test fixtures call this directly. */
  grant(userId: string, gameId: string, source?: string): Promise<void>;
  listOwnedGames(userId: string): Promise<GameRecord[]>;
}

export class PrismaOwnershipRepository implements OwnershipRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async isOwned(userId: string, gameId: string): Promise<boolean> {
    const row = await this.prisma.gameOwnership.findUnique({ where: { userId_gameId: { userId, gameId } } });
    return row !== null;
  }

  async grant(userId: string, gameId: string, source?: string): Promise<void> {
    try {
      await this.prisma.gameOwnership.create({ data: { userId, gameId, source: source ?? null } });
    } catch (cause) {
      if (isUniqueConstraintViolation(cause)) {
        throw new ApiError(409, 'INVALID_REQUEST', 'هذا المستخدم يملك هذه اللعبة بالفعل.');
      }
      throw cause;
    }
  }

  async listOwnedGames(userId: string): Promise<GameRecord[]> {
    const rows = await this.prisma.gameOwnership.findMany({
      where: { userId },
      include: { game: true },
      orderBy: { grantedAt: 'asc' },
    });
    return rows.map((r) => r.game);
  }
}
