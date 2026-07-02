import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { SCORING_QUEUE, ScoringJobData } from '../common/types';

export interface ScoringQueueCounts {
  waiting: number;
  delayed: number;
  active: number;
  failed: number;
  completed: number;
}

const SCORING_JOB_NAME = 'score';
const SCORING_ATTEMPTS = 30;
const COMPLETED_JOBS_KEPT = 200;

@Injectable()
export class ScoringQueueService {
  private readonly logger = new Logger(ScoringQueueService.name);

  constructor(
    @InjectQueue(SCORING_QUEUE) private readonly queue: Queue<ScoringJobData>,
    private readonly prisma: PrismaService,
  ) {}

  async enqueueScoring(vacancyId: string): Promise<string[]> {
    const users = await this.prisma.user.findMany({ select: { id: true } });
    if (users.length === 0) {
      this.logger.warn(
        `No users to score vacancy ${vacancyId} against — nothing enqueued. ` +
          `Seed the owner User row (OWNER_EMAIL/OWNER_USER_ID) with a UserProfile; ` +
          `the backlog reconciler will then drain it on boot or at 4am.`,
      );
      return [];
    }
    const jobIds: string[] = [];
    for (const { id } of users) {
      jobIds.push(await this.addJob(id, vacancyId));
    }
    return jobIds;
  }

  async ensureScoringJob(userId: string, vacancyId: string): Promise<void> {
    const jobId = jobIdFor(userId, vacancyId);
    const existing = await this.queue.getJob(jobId);
    if (!existing) {
      await this.addJob(userId, vacancyId);
      return;
    }
    if (await existing.isFailed()) {
      await existing.retry();
    }
  }

  async counts(): Promise<ScoringQueueCounts> {
    const counts = await this.queue.getJobCounts(
      'waiting',
      'delayed',
      'active',
      'failed',
      'completed',
    );
    return {
      waiting: counts.waiting ?? 0,
      delayed: counts.delayed ?? 0,
      active: counts.active ?? 0,
      failed: counts.failed ?? 0,
      completed: counts.completed ?? 0,
    };
  }

  private async addJob(userId: string, vacancyId: string): Promise<string> {
    const jobId = jobIdFor(userId, vacancyId);
    await this.queue.add(
      SCORING_JOB_NAME,
      { vacancyId, userId },
      {
        jobId,
        attempts: SCORING_ATTEMPTS,
        backoff: { type: 'custom' },
        removeOnComplete: { count: COMPLETED_JOBS_KEPT },
        removeOnFail: false,
      },
    );
    return jobId;
  }
}

function jobIdFor(userId: string, vacancyId: string): string {
  return `score-${userId}-${vacancyId}`;
}
