import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ApiModule } from './api/api.module';
import { AuthModule } from './auth/auth.module';
import { CollectorsModule } from './collectors/collectors.module';
import configuration from './config/configuration';
import { PipelineModule } from './pipeline/pipeline.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { ScoringModule } from './scoring/scoring.module';
import { ProfileModule } from './profile/profile.module';
import { SettingsModule } from './settings/settings.module';
import { TelegramModule } from './telegram/telegram.module';
import { TgListenerModule } from './tg-listener/tg-listener.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: [join(__dirname, '../../.env'), join(__dirname, '../.env')],
    }),
    PrismaModule,
    AuthModule,
    ScoringModule,
    QueueModule,
    PipelineModule,
    TelegramModule,
    TgListenerModule,
    CollectorsModule,
    ApiModule,
    SettingsModule,
    ProfileModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
