import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * Seed the owner User (User #0) and a placeholder UserProfile.
 *
 * Why this exists: scoring fans out one job per User. With no User row, the
 * ingestion pipeline persists vacancies but enqueues nothing — the classic
 * "N queued in Postgres, empty Redis" desync. Run this once so the backlog
 * reconciler can drain the backlog on the next boot (or the 4am cron).
 *
 *   npm run backfill-user0   (from backend/)
 */

const OWNER_EMAIL = process.env.OWNER_EMAIL || 'owner@local';
const OWNER_USER_ID = process.env.OWNER_USER_ID || undefined;

// Placeholder profile so scoring has something to match against immediately.
// Edit it later in the dashboard: Settings → Profile.
const PLACEHOLDER_PROFILE = {
  cvText:
    'Placeholder profile seeded by backfill-user0. Replace it in the dashboard Settings tab.',
  coreStack: ['TypeScript', 'Node.js', 'React'],
  strongPlus: ['NestJS', 'PostgreSQL', 'AWS'],
  redFlags: ['junior-only role', 'on-site outside Warsaw'],
  seniority: 'senior',
  locationPref: ['Remote EU', 'Warsaw hybrid'],
  salaryMin: 7000,
  salaryTarget: 9000,
};

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const user = await prisma.user.upsert({
      where: { email: OWNER_EMAIL },
      update: {},
      create: OWNER_USER_ID
        ? { id: OWNER_USER_ID, email: OWNER_EMAIL }
        : { email: OWNER_EMAIL },
      select: { id: true, email: true },
    });

    const profile = await prisma.userProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!profile) {
      await prisma.userProfile.create({
        data: { userId: user.id, ...PLACEHOLDER_PROFILE },
      });
    }

    console.log(`Owner User ready: ${user.email}  (id=${user.id})`);
    console.log(
      profile
        ? 'UserProfile already present — left untouched.'
        : 'Seeded a placeholder UserProfile — edit it in Settings → Profile.',
    );
    if (OWNER_USER_ID !== user.id) {
      console.log(`\n→ Put this in backend/.env:  OWNER_USER_ID=${user.id}`);
    }
    console.log(
      '\nNext boot (or the 4am cron) the backlog reconciler will enqueue any ' +
        '"new"/"queued" vacancies for this user.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
