import { Controller, Get, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { OwnerGuard } from '../auth/owner.guard';
import { PrismaService } from '../prisma/prisma.service';

interface ScoreDistribution {
  b0: number;
  b25: number;
  b50: number;
  b65: number;
  b80: number;
}
interface SourceRow {
  collector: string;
  n: number;
  avg: number;
  hits: number;
}
interface FunnelRow {
  status: string;
  n: number;
}
interface LlmRow {
  model: string;
  n: number;
  avg_ms: number;
  tokens: number;
  ok_pct: number;
}

@Controller('api/analytics')
@UseGuards(OwnerGuard)
export class AnalyticsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async overview(@CurrentUser() user: User) {
    const userId = user.id;

    const [dist, bySource, funnel, llm] = await Promise.all([
      this.prisma.$queryRaw<ScoreDistribution[]>`
        SELECT
          count(*) FILTER (WHERE score < 25)::int AS "b0",
          count(*) FILTER (WHERE score >= 25 AND score < 50)::int AS "b25",
          count(*) FILTER (WHERE score >= 50 AND score < 65)::int AS "b50",
          count(*) FILTER (WHERE score >= 65 AND score < 80)::int AS "b65",
          count(*) FILTER (WHERE score >= 80)::int AS "b80"
        FROM "UserMatch" WHERE "userId" = ${userId}`,
      this.prisma.$queryRaw<SourceRow[]>`
        SELECT regexp_replace(v.source, '[:/].*$', '') AS collector,
               count(*)::int AS n,
               COALESCE(round(avg(m.score)), 0)::int AS avg,
               count(*) FILTER (WHERE m.score >= 65)::int AS hits
        FROM "UserMatch" m JOIN "Vacancy" v ON v.id = m."vacancyId"
        WHERE m."userId" = ${userId}
        GROUP BY 1 ORDER BY n DESC LIMIT 40`,
      this.prisma.$queryRaw<FunnelRow[]>`
        SELECT "appStatus" AS status, count(*)::int AS n
        FROM "UserMatch"
        WHERE "userId" = ${userId} AND "appStatus" IS NOT NULL
        GROUP BY 1 ORDER BY n DESC`,
      this.prisma.$queryRaw<LlmRow[]>`
        SELECT model,
               count(*)::int AS n,
               COALESCE(round(avg("latencyMs")), 0)::int AS avg_ms,
               COALESCE(sum("promptTokens" + "completionTokens"), 0)::int AS tokens,
               round(100.0 * count(*) FILTER (WHERE ok) / NULLIF(count(*), 0))::int AS ok_pct
        FROM "LlmCall"
        GROUP BY 1 ORDER BY n DESC LIMIT 20`,
    ]);

    return {
      scoreDistribution: dist[0] ?? { b0: 0, b25: 0, b50: 0, b65: 0, b80: 0 },
      bySource,
      funnel,
      llm,
    };
  }
}
