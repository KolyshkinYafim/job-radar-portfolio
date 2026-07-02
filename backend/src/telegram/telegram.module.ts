import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SCORING_QUEUE, VACANCY_NOTIFIER } from '../common/types';
import { PrismaModule } from '../prisma/prisma.module';
import { ProfileModule } from '../profile/profile.module';
import { ScoringModule } from '../scoring/scoring.module';
import { DigestService } from './digest.service';
import { TelegramService } from './telegram.service';

@Module({
  imports: [
    ConfigModule,
    ScoringModule,
    PrismaModule,
    ProfileModule,
    BullModule.registerQueue({ name: SCORING_QUEUE }),
  ],
  providers: [
    TelegramService,
    DigestService,
    { provide: VACANCY_NOTIFIER, useExisting: TelegramService },
  ],
  exports: [TelegramService, VACANCY_NOTIFIER],
})
export class TelegramModule {}
