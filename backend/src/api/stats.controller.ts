import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { Queue } from 'bullmq';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SCORING_QUEUE } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';

@Controller('api/stats')
@UseGuards(AuthGuard)
export class StatsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoringService: ScoringService,
    @InjectQueue(SCORING_QUEUE) private readonly scoringQueue: Queue,
  ) {}

  @Get()
  async overview(@CurrentUser() user: User) {
    const userId = user.id;
    const [
      byStatus,
      byAppStatus,
      scoringAgg,
      recentMatches,
      topScored,
      queueCounts,
      llmHealthy,
    ] = await Promise.all([
      this.prisma.vacancy.groupBy({ by: ['status'], _count: { id: true } }),
      this.prisma.userMatch.groupBy({
        by: ['appStatus'],
        _count: { id: true },
        where: { userId, appStatus: { not: null } },
      }),
      this.prisma.userMatch.aggregate({
        where: { userId },
        _avg: { score: true },
        _max: { score: true },
        _min: { score: true },
        _count: { id: true },
      }),
      this.prisma.userMatch.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          vacancy: {
            select: {
              id: true,
              title: true,
              company: true,
              source: true,
              status: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.userMatch.findMany({
        where: { userId, score: { gte: 65 } },
        orderBy: { score: 'desc' },
        take: 5,
        include: {
          vacancy: {
            select: { id: true, title: true, company: true, url: true },
          },
        },
      }),
      this.scoringQueue.getJobCounts('waiting', 'delayed', 'active', 'failed'),
      this.scoringService.isHealthy(),
    ]);

    const statusMap = Object.fromEntries(
      byStatus.map((r) => [r.status, r._count.id]),
    );
    const appStatusMap = Object.fromEntries(
      byAppStatus.map((r) => [r.appStatus ?? 'none', r._count.id]),
    );

    return {
      pipeline: statusMap,
      applications: appStatusMap,
      scoring: {
        total: scoringAgg._count.id,
        avg: Math.round((scoringAgg._avg.score ?? 0) * 10) / 10,
        max: scoringAgg._max.score ?? 0,
        min: scoringAgg._min.score ?? 0,
      },
      queue: {
        waiting: queueCounts.waiting ?? 0,
        delayed: queueCounts.delayed ?? 0,
        active: queueCounts.active ?? 0,
        failed: queueCounts.failed ?? 0,
      },
      llm: llmHealthy ? 'online' : 'offline',
      recentActivity: recentMatches.map((m) => ({
        ...m.vacancy,
        applicationStatus: m.appStatus,
        score: { value: m.score },
      })),
      topScored: topScored.map((m) => ({
        ...m.vacancy,
        applicationStatus: m.appStatus,
        score: { value: m.score },
      })),
    };
  }
}
