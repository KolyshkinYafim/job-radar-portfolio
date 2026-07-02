import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { RemoteMode, Seniority } from '../common/types';
import { VacancyStatus } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringQueueService } from '../queue/scoring-queue.service';
import { hardFilter } from './ingestion.service';

export interface ReconcileResult {
  requeued: number;
  filteredOut: number;
}

@Injectable()
export class BacklogReconcilerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BacklogReconcilerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: ScoringQueueService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.reconcile();
    } catch (error) {
      this.logger.error(
        `Backlog reconciliation failed: ${(error as Error).message}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async reconcileDaily(): Promise<void> {
    try {
      await this.reconcile();
    } catch (error) {
      this.logger.error(
        `Backlog reconciliation failed: ${(error as Error).message}`,
      );
    }
  }

  async reconcile(): Promise<ReconcileResult> {
    const stale = await this.prisma.vacancy.findMany({
      where: { status: { in: [VacancyStatus.Queued, VacancyStatus.New] } },
      select: {
        id: true,
        title: true,
        rawText: true,
        stack: true,
        seniority: true,
        remote: true,
        status: true,
      },
    });

    const users = await this.prisma.user.findMany({ select: { id: true } });
    const result: ReconcileResult = { requeued: 0, filteredOut: 0 };

    for (const vacancy of stale) {
      const { passed } = hardFilter({
        title: vacancy.title,
        rawText: vacancy.rawText,
        stack: vacancy.stack,
        seniority: (vacancy.seniority ?? 'unknown') as Seniority,
        remote: (vacancy.remote ?? 'unknown') as RemoteMode,
      });

      if (!passed) {
        await this.prisma.vacancy.update({
          where: { id: vacancy.id },
          data: { status: VacancyStatus.FilteredOut },
        });
        result.filteredOut++;
        continue;
      }

      for (const { id: userId } of users) {
        const match = await this.prisma.userMatch.findUnique({
          where: { userId_vacancyId: { userId, vacancyId: vacancy.id } },
          select: { id: true },
        });
        if (match) {
          continue;
        }
        await this.queue.ensureScoringJob(userId, vacancy.id);
        result.requeued++;
      }

      if (vacancy.status === VacancyStatus.New && users.length > 0) {
        await this.prisma.vacancy.update({
          where: { id: vacancy.id },
          data: { status: VacancyStatus.Queued },
        });
      }
    }

    if (stale.length > 0) {
      this.logger.log(
        `Backlog reconciled: ${result.requeued} re-queued, ${result.filteredOut} filtered out of ${stale.length} stale`,
      );
    }
    return result;
  }
}
