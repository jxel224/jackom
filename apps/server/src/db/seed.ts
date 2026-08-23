// `npm run db:seed` — idempotent (safe to run repeatedly): seeds the one Game the platform has
// today, HACKERS. Deliberately does NOT create any User — PART 4 is explicit that fake production
// users are never auto-created; use db/dev-grant-ownership.ts once you've registered a real account.
import { config as loadDotenv } from 'dotenv';
import { createPrismaClient } from './client.js';
import { loadServerEnvConfig } from '../env.js';

loadDotenv({ path: new URL('../../.env', import.meta.url) });

async function main(): Promise<void> {
  const env = loadServerEnvConfig();
  const prisma = createPrismaClient(env.databaseUrl);
  try {
    const game = await prisma.game.upsert({
      where: { slug: 'hackers' },
      update: {},
      create: { slug: 'hackers', name: 'لعبة الهاكر', isActive: true },
    });
    console.log(`Seeded Game: ${game.slug} (${game.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
