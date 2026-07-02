import { Processor, WorkerHost } from '@nestjs/bullmq';
import {
  Inject,
  Logger,
  OnApplicationBootstrap,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Vacancy } from '@prisma/client';
import { Job } from 'bullmq';
import {
  SCORING_QUEUE,
  VACANCY_NOTIFIER,
  VacancyStatus,
} from '../common/types';
import type {
  ScoreResult,
  ScoredVacancyView,
  ScoringJobData,
  VacancyNotifier,
} from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { UserProfileService } from '../profile/user-profile.service';
import { ScoringService } from '../scoring/scoring.service';
import { userProfileToCandidate } from '../scoring/user-profile.mapper';

const BASE_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 30 * 60_000;
const DEFAULT_THRESHOLD = 65;

@Processor(SCORING_QUEUE, {
  concurrency: 1,
  settings: {
    backoffStrategy: (attemptsMade: number) =>
      Math.min(
        BASE_BACKOFF_MS * 2 ** Math.max(0, attemptsMade - 1),
        MAX_BACKOFF_MS,
      ),
  },
})
export class ScoringProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(ScoringProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scoringService: ScoringService,
    private readonly userProfileService: UserProfileService,
    private readonly configService: ConfigService,
    @Optional()
    @Inject(VACANCY_NOTIFIER)
    private readonly notifier?: VacancyNotifier,
  ) {
    super();
  }

  onApplicationBootstrap(): void {
    const concurrency =
      this.configService.get<number>('scoringConcurrency') ?? 1;
    if (concurrency > 1) {
      this.worker.concurrency = concurrency;
      this.logger.log(`Scoring concurrency set to ${concurrency}`);
    }
  }

  async process(job: Job<ScoringJobData>): Promise<void> {
    const { vacancyId, userId } = job.data;

    const existingMatch = await this.prisma.userMatch.findUnique({
      where: { userId_vacancyId: { userId, vacancyId } },
      select: { id: true },
    });
    if (existingMatch) {
      this.logger.debug(
        `UserMatch already exists for user ${userId} × vacancy ${vacancyId}, skipping`,
      );
      return;
    }

    const vacancy = await this.prisma.vacancy.findUnique({
      where: { id: vacancyId },
    });
    if (!vacancy) {
      this.logger.warn(`Vacancy ${vacancyId} not found, dropping scoring job`);
      return;
    }
    if (vacancy.status === VacancyStatus.FilteredOut) {
      this.logger.debug(
        `Vacancy ${vacancyId} was filtered out, dropping scoring job`,
      );
      return;
    }

    const profile = await this.userProfileService.getByUserId(userId);
    if (!profile) {
      this.logger.warn(
        `User ${userId} has no UserProfile, skipping scoring for vacancy ${vacancyId}`,
      );
      return;
    }

    if (!(await this.scoringService.isHealthy())) {
      throw new Error('LLM offline');
    }

    const result = await this.scoringService.scoreVacancy(
      {
        title: vacancy.title,
        company: vacancy.company ?? undefined,
        rawText: vacancy.rawText,
      },
      userProfileToCandidate(profile),
      { userId, taskType: 'score' },
    );

    await this.prisma.userMatch.upsert({
      where: { userId_vacancyId: { userId, vacancyId } },
      create: {
        userId,
        vacancyId,
        score: result.score,
        location: result.location || null,
        reasonsPro: result.reasonsPro,
        reasonsCon: result.reasonsCon,
        redFlags: result.redFlags,
        model: result.model,
      },
      update: {
        score: result.score,
        location: result.location || null,
        reasonsPro: result.reasonsPro,
        reasonsCon: result.reasonsCon,
        redFlags: result.redFlags,
        model: result.model,
      },
    });

    const threshold =
      this.configService.get<number>('scoringThreshold') ?? DEFAULT_THRESHOLD;
    const status =
      result.score >= threshold
        ? await this.notify(vacancy, result)
        : VacancyStatus.Scored;

    if (status === VacancyStatus.Notified) {
      await this.prisma.vacancy.update({
        where: { id: vacancyId },
        data: { status },
      });
    } else {
      await this.prisma.vacancy.updateMany({
        where: { id: vacancyId, status: { not: VacancyStatus.Notified } },
        data: { status },
      });
    }
  }

  private async notify(
    vacancy: Vacancy,
    result: ScoreResult,
  ): Promise<VacancyStatus> {
    if (!this.notifier) {
      this.logger.warn(
        `No notifier bound, vacancy ${vacancy.id} stays at status "scored"`,
      );
      return VacancyStatus.Scored;
    }

    const view: ScoredVacancyView = {
      id: vacancy.id,
      title: vacancy.title,
      company: vacancy.company,
      url: vacancy.url,
      source: vacancy.source,
      salaryMin: vacancy.salaryMin,
      salaryMax: vacancy.salaryMax,
      currency: vacancy.currency,
      remote: vacancy.remote,
    };

    try {
      await this.notifier.notifyScored(view, result);
      return VacancyStatus.Notified;
    } catch (err) {
      this.logger.error(
        `Notifier failed for vacancy ${vacancy.id}, match is persisted`,
        err instanceof Error ? err.stack : String(err),
      );
      return VacancyStatus.Scored;
    }
  }
}
