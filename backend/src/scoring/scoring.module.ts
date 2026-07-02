import { Module } from '@nestjs/common';
import { ScoringService } from './scoring.service';
import { ProfileParserService } from './profile-parser.service';
import { LlmCallLogger } from './llm-call-logger.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [ScoringService, ProfileParserService, LlmCallLogger],
  exports: [ScoringService, ProfileParserService, LlmCallLogger],
})
export class ScoringModule {}
