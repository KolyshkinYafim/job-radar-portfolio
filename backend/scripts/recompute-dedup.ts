import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { VacancyStatus } from '../src/common/types';
import { computeHash } from '../src/pipeline/ingestion.service';

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const vacancies = await prisma.vacancy.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      source: true,
      externalId: true,
      title: true,
      company: true,
      rawText: true,
      status: true,
      dedupHash: true,
    },
  });

  const canonicalByHash = new Map<string, string>();
  let rehashed = 0;
  let duplicates = 0;

  for (const v of vacancies) {
    const newHash = computeHash({
      source: v.source,
      externalId: v.externalId ?? undefined,
      title: v.title,
      company: v.company ?? undefined,
      rawText: v.rawText,
    });

    const canonicalId = canonicalByHash.get(newHash);
    if (!canonicalId) {
      canonicalByHash.set(newHash, v.id);
      if (newHash !== v.dedupHash) {
        await prisma.vacancy.update({ where: { id: v.id }, data: { dedupHash: newHash } });
        rehashed++;
      }
      continue;
    }

    duplicates++;
    if (v.status === VacancyStatus.Queued || v.status === VacancyStatus.New) {
      await prisma.vacancy.update({
        where: { id: v.id },
        data: { status: VacancyStatus.FilteredOut },
      });
    }
  }

  console.log(
    `Total: ${vacancies.length} · re-hashed: ${rehashed} · cross-source duplicates demoted: ${duplicates}`,
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
