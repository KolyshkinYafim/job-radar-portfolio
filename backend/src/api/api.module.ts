import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SCORING_QUEUE } from '../common/types';
import { CollectorsModule } from '../collectors/collectors.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ScoringModule } from '../scoring/scoring.module';
import { AnalyticsController } from './analytics.controller';
import { CollectController } from './collect.controller';
import { FeedController } from './feed.controller';
import { GoldenLabelController } from './golden-label.controller';
import { VacanciesService } from './vacancies.service';
import { StatsController } from './stats.controller';

@Module({
  imports: [
    PrismaModule,
    ScoringModule,
    AuthModule,
    CollectorsModule,
    BullModule.registerQueue({ name: SCORING_QUEUE }),
  ],
  controllers: [
    GoldenLabelController,
    FeedController,
    StatsController,
    CollectController,
    AnalyticsController,
  ],
  providers: [VacanciesService],
})
export class ApiModule {}
