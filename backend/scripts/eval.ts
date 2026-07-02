import 'dotenv/config';
import { writeFileSync } from 'fs';
import type { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import configuration from '../src/config/configuration';
import { LlmCallLogger } from '../src/scoring/llm-call-logger.service';
import { ScoringService } from '../src/scoring/scoring.service';
import { userProfileToCandidate } from '../src/scoring/user-profile.mapper';
import type { PrismaService } from '../src/prisma/prisma.service';

type Label = 'yes' | 'maybe' | 'no';

const OUTPUT = 'eval-results.json';
const GRAY_ZONE_MIN = 50;
const TEXT_LIMIT = 3000;

const config = configuration();
const configService = {
  get: (path: string) =>
    path
      .split('.')
      .reduce<unknown>(
        (obj, key) => (obj as Record<string, unknown>)?.[key],
        config,
      ),
} as unknown as ConfigService;

function toBucket(score: number, threshold: number): Label {
  if (score >= threshold) return 'yes';
  if (score >= GRAY_ZONE_MIN) return 'maybe';
  return 'no';
}

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const ownerUserId = process.env.OWNER_USER_ID;
  if (!ownerUserId) {
    console.error('OWNER_USER_ID env not configured');
    process.exit(1);
  }
  const ownerProfile = await prisma.userProfile.findUnique({
    where: { userId: ownerUserId },
  });
  if (!ownerProfile) {
    console.error(`No UserProfile for OWNER_USER_ID=${ownerUserId}`);
    process.exit(1);
  }
  const candidate = userProfileToCandidate(ownerProfile);

  const items = await prisma.vacancy.findMany({
    where: { goldenLabel: { not: null } },
    select: {
      id: true,
      source: true,
      title: true,
      company: true,
      rawText: true,
      goldenLabel: true,
    },
  });

  if (!items.length) {
    console.error(
      'No labeled vacancies. Label them on the dashboard (Labeling tab) first.',
    );
    process.exit(1);
  }

  const llmLogger = new LlmCallLogger(prisma as unknown as PrismaService);
  const service = new ScoringService(configService, llmLogger);
  if (!(await service.isHealthy())) {
    console.error(`LLM is not reachable at ${config.llm.baseUrl}.`);
    process.exit(1);
  }

  const threshold = config.scoringThreshold;
  const results: Array<{
    id: string;
    title: string;
    source: string;
    label: string;
    score: number;
    predicted: Label;
    model: string;
    latencyMs: number;
  }> = [];

  for (const item of items) {
    const score = await service.scoreVacancy(
      {
        title: item.title,
        company: item.company ?? undefined,
        rawText: item.rawText.slice(0, TEXT_LIMIT),
      },
      candidate,
      { userId: ownerUserId, taskType: 'eval' },
    );
    const predicted = toBucket(score.score, threshold);
    results.push({
      id: item.id,
      title: item.title,
      source: item.source,
      label: item.goldenLabel as string,
      score: score.score,
      predicted,
      model: score.model,
      latencyMs: score.latencyMs,
    });
    const mark = predicted === item.goldenLabel ? '✓' : '✗';
    console.log(
      `${mark} ${String(score.score).padStart(3)} [${predicted}] vs [${item.goldenLabel}] — ${item.title}`,
    );
  }

  const exact = results.filter((r) => r.predicted === r.label).length;
  const falseAlarms = results.filter(
    (r) => r.label === 'no' && r.predicted === 'yes',
  ).length;
  const misses = results.filter(
    (r) => r.label === 'yes' && r.predicted === 'no',
  ).length;
  const avgLatency = Math.round(
    results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length,
  );

  console.log('');
  console.log(
    `Model: ${results[0].model} · threshold: ${threshold} · items: ${results.length}`,
  );
  console.log(
    `Exact bucket match: ${exact}/${results.length} (${Math.round((exact / results.length) * 100)}%)`,
  );
  console.log(`False alarms (no -> yes): ${falseAlarms}`);
  console.log(`Misses (yes -> no): ${misses}`);
  console.log(`Avg latency: ${avgLatency}ms`);

  writeFileSync(OUTPUT, JSON.stringify({ threshold, results }, null, 2));
  console.log(`Details written to ${OUTPUT}.`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
