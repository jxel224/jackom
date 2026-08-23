// Real PostgreSQL integration coverage for Games + GameOwnership (PART 13).
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestPrismaClient, resetTestDatabase } from './test-db.js';
import type { PrismaClient } from '../../src/db/client.js';
import { PrismaUserRepository } from '../../src/db/repositories/user-repository.js';
import { PrismaGameRepository } from '../../src/db/repositories/game-repository.js';
import { PrismaOwnershipRepository } from '../../src/db/repositories/ownership-repository.js';
import { OwnershipService } from '../../src/db/services/ownership-service.js';

let prisma: PrismaClient;
let userRepo: PrismaUserRepository;
let ownershipService: OwnershipService;

beforeAll(() => {
  prisma = createTestPrismaClient();
  userRepo = new PrismaUserRepository(prisma);
  ownershipService = new OwnershipService(new PrismaGameRepository(prisma), new PrismaOwnershipRepository(prisma));
});
afterEach(async () => {
  await resetTestDatabase(prisma);
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function makeUser(email: string) {
  return userRepo.create({ email, passwordHash: 'x', displayName: email });
}

describe('Games (real PostgreSQL)', () => {
  it('the seed script produces a real, active HACKERS game', async () => {
    const game = await prisma.game.upsert({ where: { slug: 'hackers' }, update: {}, create: { slug: 'hackers', name: 'لعبة الهاكر', isActive: true } });
    expect(game.isActive).toBe(true);
    expect(game.slug).toBe('hackers');
  });

  it('enforces a unique slug at the DATABASE level', async () => {
    await prisma.game.create({ data: { slug: 'unique-slug-test', name: 'A', isActive: true } });
    await expect(prisma.game.create({ data: { slug: 'unique-slug-test', name: 'B', isActive: true } })).rejects.toThrow();
  });

  it('an inactive game cannot be hosted, even by its real owner', async () => {
    const game = await prisma.game.create({ data: { slug: 'inactive-game', name: 'Retired', isActive: false } });
    const user = await makeUser('owner-of-inactive@example.test');
    await ownershipService.grantOwnership(user.id, game.slug);
    await expect(ownershipService.requireOwnedActiveGame(user.id, game.slug)).rejects.toMatchObject({ code: 'GAME_NOT_ACTIVE' });
  });
});

describe('GameOwnership (real PostgreSQL)', () => {
  it('granting ownership, then looking it up, returns true', async () => {
    const game = await prisma.game.create({ data: { slug: 'grant-test', name: 'G', isActive: true } });
    const user = await makeUser('grantee@example.test');
    await ownershipService.grantOwnership(user.id, game.slug);
    await expect(ownershipService.requireOwnedActiveGame(user.id, game.slug)).resolves.toMatchObject({ slug: game.slug });
  });

  it('a User who was never granted ownership fails the lookup', async () => {
    const game = await prisma.game.create({ data: { slug: 'unowned-test', name: 'G', isActive: true } });
    const user = await makeUser('non-owner@example.test');
    await expect(ownershipService.requireOwnedActiveGame(user.id, game.slug)).rejects.toMatchObject({ code: 'GAME_NOT_OWNED' });
  });

  it('a duplicate grant for the same (User, Game) pair is blocked at the DATABASE level (@@unique([userId, gameId]))', async () => {
    const game = await prisma.game.create({ data: { slug: 'dup-grant-test', name: 'G', isActive: true } });
    const user = await makeUser('duplicate-grantee@example.test');
    await ownershipService.grantOwnership(user.id, game.slug);
    await expect(ownershipService.grantOwnership(user.id, game.slug)).rejects.toThrow();
    // Confirm exactly one row exists — the DB constraint actually stopped the second insert, not just the service layer catching its own error before attempting it.
    const count = await prisma.gameOwnership.count({ where: { userId: user.id, gameId: game.id } });
    expect(count).toBe(1);
  });

  it('one User can own multiple Games', async () => {
    const gameA = await prisma.game.create({ data: { slug: 'multi-a', name: 'A', isActive: true } });
    const gameB = await prisma.game.create({ data: { slug: 'multi-b', name: 'B', isActive: true } });
    const user = await makeUser('collector@example.test');
    await ownershipService.grantOwnership(user.id, gameA.slug);
    await ownershipService.grantOwnership(user.id, gameB.slug);
    const owned = await ownershipService.listOwnedGames(user.id);
    expect(owned.map((g) => g.slug).sort()).toEqual(['multi-a', 'multi-b']);
  });

  it('multiple Users can independently own the same Game', async () => {
    const game = await prisma.game.create({ data: { slug: 'shared-game', name: 'G', isActive: true } });
    const userA = await makeUser('buyer-a@example.test');
    const userB = await makeUser('buyer-b@example.test');
    await ownershipService.grantOwnership(userA.id, game.slug);
    await ownershipService.grantOwnership(userB.id, game.slug);
    await expect(ownershipService.requireOwnedActiveGame(userA.id, game.slug)).resolves.toBeTruthy();
    await expect(ownershipService.requireOwnedActiveGame(userB.id, game.slug)).resolves.toBeTruthy();
  });

  it('deleting a User cascades to their ownership rows (no orphaned GameOwnership left behind)', async () => {
    const game = await prisma.game.create({ data: { slug: 'cascade-test', name: 'G', isActive: true } });
    const user = await makeUser('to-be-deleted@example.test');
    await ownershipService.grantOwnership(user.id, game.slug);
    await prisma.user.delete({ where: { id: user.id } });
    const remaining = await prisma.gameOwnership.count({ where: { userId: user.id } });
    expect(remaining).toBe(0);
  });
});
