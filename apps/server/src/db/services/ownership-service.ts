import { ApiErrors } from '../../http/errors.js';
import { GameRepository, type GameRecord } from '../repositories/game-repository.js';
import { OwnershipRepository } from '../repositories/ownership-repository.js';

/**
 * The one business-domain authorization boundary for "can this User host this Game" (PART 6/7).
 * Every check below is enforced HERE, server-side, before any Redis room state is ever created —
 * never left to the frontend hiding a button.
 */
export class OwnershipService {
  constructor(
    private readonly gameRepo: GameRepository,
    private readonly ownershipRepo: OwnershipRepository,
  ) {}

  /** Order matters and is intentional: existence, then active status, then ownership — each a distinct, distinguishable rejection reason. */
  async requireOwnedActiveGame(userId: string, gameSlug: string): Promise<GameRecord> {
    const game = await this.gameRepo.findBySlug(gameSlug);
    if (!game) throw ApiErrors.gameNotFound();
    if (!game.isActive) throw ApiErrors.gameNotActive();
    const owned = await this.ownershipRepo.isOwned(userId, game.id);
    if (!owned) throw ApiErrors.gameNotOwned();
    return game;
  }

  async listOwnedGames(userId: string): Promise<GameRecord[]> {
    return this.ownershipRepo.listOwnedGames(userId);
  }

  /**
   * NEVER wired to any public HTTP route (PART 9) — a production client must find it structurally
   * impossible to call "give me ownership." Used only by the dev-grant CLI script
   * (db/dev-grant-ownership.ts) and test fixtures, both of which run with direct database access,
   * not through the authenticated HTTP boundary a browser could reach.
   */
  async grantOwnership(userId: string, gameSlug: string, source?: string): Promise<void> {
    const game = await this.gameRepo.findBySlug(gameSlug);
    if (!game) throw ApiErrors.gameNotFound();
    await this.ownershipRepo.grant(userId, game.id, source);
  }
}
