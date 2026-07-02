import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SCORING_QUEUE } from '../common/types';
import { ProfileModule } from '../profile/profile.module';
import { ScoringModule } from '../scoring/scoring.module';
import { TelegramModule } from '../telegram/telegram.module';
import { ScoringQueueService } from './scoring-queue.service';
import { ScoringProcessor } from './scoring.processor';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host') ?? 'localhost',
          port: configService.get<number>('redis.port') ?? 6379,
        },
      }),
    }),
    BullModule.registerQueue({ name: SCORING_QUEUE }),
    ScoringModule,
    ProfileModule,
    TelegramModule,
  ],
  providers: [ScoringQueueService, ScoringProcessor],
  exports: [ScoringQueueService],
})
export class QueueModule {}
