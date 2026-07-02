import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import configuration from '../src/config/configuration';

const GRAY_ZONE_MIN = 50;

async function main(): Promise<void> {
  const ownerUserId = process.env.OWNER_USER_ID;
  if (!ownerUserId) {
    console.error('OWNER_USER_ID env not configured');
    process.exit(1);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const threshold = configuration().scoringThreshold;

  const matches = await prisma.userMatch.findMany({
    where: { userId: ownerUserId },
    select: {
      score: true,
      location: true,
      reasonsPro: true,
      vacancy: { select: { source: true } },
    },
  });

  if (!matches.length) {
    console.log(`No matches yet for user ${ownerUserId}.`);
    await prisma.$disconnect();
    return;
  }

  const total = matches.length;
  const bucket = (v: number) =>
    v >= 80
      ? '80-100 ideal'
      : v >= threshold
        ? `${threshold}-79 match`
        : v >= GRAY_ZONE_MIN
          ? 'gray 50-64'
          : v >= 30
            ? '30-49 weak'
            : '0-29 miss';
  const buckets = new Map<string, number>();
  for (const m of matches)
    buckets.set(bucket(m.score), (buckets.get(bucket(m.score)) ?? 0) + 1);

  console.log(
    `\n=== SCORE DISTRIBUTION (${total} matches, threshold ${threshold}) ===`,
  );
  for (const [b, n] of [...buckets.entries()].sort((a, z) =>
    z[0].localeCompare(a[0]),
  )) {
    console.log(
      `  ${b.padEnd(14)} ${n}  ${'█'.repeat(Math.round((n / total) * 40))}`,
    );
  }
  const hits = matches.filter((m) => m.score >= threshold).length;
  console.log(`  -> ${hits} matches (${((hits / total) * 100).toFixed(1)}%)`);

  console.log('\n=== SOURCE YIELD (avg / max / matches) ===');
  const bySource = new Map<string, number[]>();
  for (const m of matches) {
    const src = m.vacancy.source.split('/')[0];
    if (!bySource.has(src)) bySource.set(src, []);
    bySource.get(src)!.push(m.score);
  }
  const rows = [...bySource.entries()]
    .map(([src, vals]) => ({
      src,
      n: vals.length,
      avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
      max: Math.max(...vals),
      hits: vals.filter((v) => v >= threshold).length,
    }))
    .sort((a, b) => b.hits - a.hits || b.avg - a.avg);
  for (const r of rows) {
    const rate = ((r.hits / r.n) * 100).toFixed(1);
    console.log(
      `  ${r.src.padEnd(12)} n=${String(r.n).padStart(4)}  avg=${String(r.avg).padStart(3)}  max=${String(r.max).padStart(3)}  hits=${r.hits} (${rate}%)`,
    );
  }

  console.log('\n=== DATA QUALITY ===');
  const verbose = matches.filter((m) => (m.location?.length ?? 0) > 35).length;
  const emptyLoc = matches.filter((m) => !m.location).length;
  const reasons = matches.flatMap((m) => m.reasonsPro);
  const longReasons = reasons.filter((r) => r.length > 100).length;
  console.log(`  location: ${verbose} verbose (>35 chars), ${emptyLoc} empty`);
  console.log(`  reasons:  ${longReasons}/${reasons.length} over 100 chars`);

  const scoreCalls = await prisma.llmCall.findMany({
    where: { userId: ownerUserId, taskType: 'score' },
    select: { latencyMs: true },
  });
  console.log('\n=== PERFORMANCE ===');
  if (scoreCalls.length) {
    const lat = scoreCalls.map((c) => c.latencyMs);
    console.log(`  scoring calls: ${scoreCalls.length}`);
    console.log(
      `  latency avg ${Math.round(lat.reduce((a, b) => a + b, 0) / lat.length)}ms, max ${Math.max(...lat)}ms`,
    );
  } else {
    console.log(
      '  no LlmCall data yet (logger added in A3, populated on next runs)',
    );
  }

  console.log('\n=== SUGGESTIONS ===');
  const tips: string[] = [];
  if (verbose / total > 0.03)
    tips.push(`${verbose} verbose locations — tighten the location prompt.`);
  for (const r of rows) {
    if (r.n >= 50 && r.hits / r.n < 0.02)
      tips.push(
        `Source "${r.src}": ${r.n} scored, only ${r.hits} hits — consider disabling or pre-filtering.`,
      );
  }
  if (hits / total < 0.02)
    tips.push(
      'Very low match rate — likely a source-mix problem (add EU-remote-focused boards), not the rubric.',
    );
  if (
    scoreCalls.length &&
    Math.max(...scoreCalls.map((c) => c.latencyMs)) > 60000
  )
    tips.push(
      'Some requests near the timeout — lower --parallel for steadier latency.',
    );
  console.log(
    tips.length
      ? tips.map((t) => `  • ${t}`).join('\n')
      : '  Nothing obvious — looks healthy.',
  );
  console.log('');

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
