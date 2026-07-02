import 'dotenv/config';
import type { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import configuration from '../src/config/configuration';
import { LlmCallLogger } from '../src/scoring/llm-call-logger.service';
import { ScoringService } from '../src/scoring/scoring.service';
import { userProfileToCandidate } from '../src/scoring/user-profile.mapper';
import type { PrismaService } from '../src/prisma/prisma.service';

const SAMPLES: Array<{ label: string; title: string; company: string; rawText: string }> = [
  {
    label: 'expected STRONG match',
    title: 'Senior Full-Stack Engineer (TypeScript)',
    company: 'Acme GmbH',
    rawText: [
      'We are hiring a Senior Full-Stack Engineer to build an AI-powered product.',
      'Stack: TypeScript, React, Next.js, NestJS, PostgreSQL, Prisma, Redis, AWS.',
      'Fully remote within the EU. €85,000–100,000. LLM/agent features in the product.',
    ].join('\n'),
  },
  {
    label: 'expected POOR match',
    title: 'Junior Java Developer (On-site Munich)',
    company: 'SomeCorp',
    rawText: [
      'Junior Java backend developer, 0-2 years experience.',
      'On-site in our Munich office, no remote option. Spring Boot, Hibernate, Oracle.',
    ].join('\n'),
  },
];

const config = configuration();
const configService = {
  get: (path: string) =>
    path
      .split('.')
      .reduce<unknown>((obj, key) => (obj as Record<string, unknown>)?.[key], config),
} as unknown as ConfigService;

async function main(): Promise<void> {
  console.log(`Endpoint: ${config.llm.baseUrl}`);
  console.log(`API key:  ${config.llm.apiKey ? 'set' : '(none)'}`);
  console.log(`Thinking: ${config.llm.thinking ? 'on' : 'off'}\n`);

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

  const llmLogger = new LlmCallLogger(prisma as unknown as PrismaService);
  const service = new ScoringService(configService, llmLogger);

  if (!(await service.isHealthy())) {
    console.error('❌ LLM endpoint is not reachable. Check LLM_BASE_URL / LLM_API_KEY / pod status.');
    process.exit(1);
  }
  console.log('✅ Endpoint reachable.\n');

  for (const sample of SAMPLES) {
    console.log(`— ${sample.label}: ${sample.title} · ${sample.company}`);
    try {
      const result = await service.scoreVacancy(sample, candidate, {
        userId: ownerUserId,
        taskType: 'llm-check',
      });
      console.log(`  model: ${result.model}  ·  latency: ${result.latencyMs}ms`);
      console.log(`  SCORE: ${result.score}/100`);
      if (result.stackMatch.length) console.log(`  stack: ${result.stackMatch.join(', ')}`);
      if (result.reasonsPro.length) console.log(`  pro:   ${result.reasonsPro.join('; ')}`);
      if (result.reasonsCon.length) console.log(`  con:   ${result.reasonsCon.join('; ')}`);
      if (result.redFlags.length) console.log(`  flags: ${result.redFlags.join('; ')}`);
    } catch (error) {
      console.error(`  ❌ scoring failed: ${(error as Error).message}`);
    }
    console.log('');
  }

  console.log('Done. If the strong match scored high and the poor one low, the endpoint is working.');
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
