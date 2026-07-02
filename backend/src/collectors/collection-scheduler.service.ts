import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { INGESTOR } from '../common/types';
import type { Ingestor } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { JOB_COLLECTORS } from './collector.interface';
import type { JobCollector } from './collector.interface';

export interface CollectionRunStats {
  queued: number;
  duplicate: number;
  filtered: number;
  error: number;
  collectors: number;
  finishedAt: string | null;
}

@Injectable()
export class CollectionSchedulerService {
  private readonly logger = new Logger(CollectionSchedulerService.name);
  private running = false;
  private lastRun: CollectionRunStats | null = null;

  constructor(
    @Inject(JOB_COLLECTORS) private readonly collectors: JobCollector[],
    @Inject(INGESTOR) private readonly ingestor: Ingestor,
    private readonly prisma: PrismaService,
  ) {}

  isRunning(): boolean {
    return this.running;
  }

  getLastRun(): CollectionRunStats | null {
    return this.lastRun;
  }

  @Cron(CronExpression.EVERY_2_HOURS)
  async runAll(): Promise<void> {
    await this.runOnce();
  }

  triggerManual(): { started: boolean; alreadyRunning: boolean } {
    if (this.running) {
      return { started: false, alreadyRunning: true };
    }
    void this.runOnce();
    return { started: true, alreadyRunning: false };
  }

  async runOnce(): Promise<CollectionRunStats> {
    if (this.running) {
      this.logger.warn('Collection already running — skipping duplicate run');
      return (
        this.lastRun ?? {
          queued: 0,
          duplicate: 0,
          filtered: 0,
          error: 0,
          collectors: 0,
          finishedAt: null,
        }
      );
    }

    this.running = true;
    const stats = { queued: 0, duplicate: 0, filtered: 0, error: 0 };
    let activeCount = 0;

    try {
      const disabled = new Set(
        (
          await this.prisma.sourceConfig.findMany({ where: { enabled: false } })
        ).map((c) => c.name),
      );
      const active = this.collectors.filter((c) => !disabled.has(c.name));
      activeCount = active.length;
      this.logger.log(
        `Starting collection run across ${active.length}/${this.collectors.length} enabled collector(s)`,
      );

      for (const collector of active) {
        try {
          const vacancies = await collector.collect();
          this.logger.log(
            `${collector.name}: collected ${vacancies.length} raw vacancies`,
          );

          for (const raw of vacancies) {
            const result = await this.ingestor.ingest(raw);
            stats[
              result.outcome === 'queued'
                ? 'queued'
                : result.outcome === 'duplicate'
                  ? 'duplicate'
                  : result.outcome === 'filtered_out'
                    ? 'filtered'
                    : 'error'
            ]++;
          }
        } catch (err) {
          this.logger.error(
            `Collector ${collector.name} threw: ${(err as Error).message}`,
          );
          stats.error++;
        }
      }

      this.logger.log(
        `Collection run done — queued: ${stats.queued}, dup: ${stats.duplicate}, filtered: ${stats.filtered}, error: ${stats.error}`,
      );
    } finally {
      this.running = false;
    }

    this.lastRun = {
      ...stats,
      collectors: activeCount,
      finishedAt: new Date().toISOString(),
    };
    return this.lastRun;
  }
}
