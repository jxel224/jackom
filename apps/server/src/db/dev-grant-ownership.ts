// Development-only ownership grant (PART 9) — since Stripe/payments don't exist yet, this is the
// sanctioned way to test the owner-gated Create Room flow locally: register a real account through
// the real /api/auth/register endpoint, then run this script to grant it a game.
//
//   npm run db:grant-ownership -- <email> [gameSlug=hackers]
//
// This is a CLI script with direct database access — it is NOT an HTTP endpoint, and there is no
// route anywhere that lets a browser client trigger it. That's the actual security boundary (PART 9's
// "impossible for a production client to call 'give me ownership' without authorization"): this
// script requires shell access to the machine running it, the same trust level as running any other
// local dev/ops tooling.
import { config as loadDotenv } from 'dotenv';
import { createPrismaClient } from './client.js';
import { loadServerEnvConfig } from '../env.js';
import { PrismaUserRepository } from './repositories/user-repository.js';
import { PrismaGameRepository } from './repositories/game-repository.js';
import { PrismaOwnershipRepository } from './repositories/ownership-repository.js';
import { OwnershipService } from './services/ownership-service.js';

loadDotenv({ path: new URL('../../.env', import.meta.url) });

async function main(): Promise<void> {
  const [, , email, gameSlug = 'hackers'] = process.argv;
  if (!email) {
    console.error('Usage: npm run db:grant-ownership -- <email> [gameSlug=hackers]');
    process.exit(1);
  }

  const env = loadServerEnvConfig();
  const prisma = createPrismaClient(env.databaseUrl);
  try {
    const userRepo = new PrismaUserRepository(prisma);
    const ownershipService = new OwnershipService(new PrismaGameRepository(prisma), new PrismaOwnershipRepository(prisma));

    const user = await userRepo.findByEmail(email.trim().toLowerCase());
    if (!user) {
      console.error(`No User found with email "${email}" — register the account first (POST /api/auth/register), then re-run this script.`);
      process.exit(1);
    }

    await ownershipService.grantOwnership(user.id, gameSlug, 'dev-grant');
    console.log(`Granted "${gameSlug}" ownership to ${user.email} (${user.id}).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('Grant failed:', err);
  process.exit(1);
});
