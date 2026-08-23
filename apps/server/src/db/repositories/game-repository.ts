import type { PrismaClient } from '../client.js';

export interface GameRecord {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface GameRepository {
  findBySlug(slug: string): Promise<GameRecord | null>;
  findById(id: string): Promise<GameRecord | null>;
}

export class PrismaGameRepository implements GameRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findBySlug(slug: string): Promise<GameRecord | null> {
    return this.prisma.game.findUnique({ where: { slug } });
  }

  async findById(id: string): Promise<GameRecord | null> {
    return this.prisma.game.findUnique({ where: { id } });
  }
}
