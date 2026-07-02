import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TgListenerService } from './tg-listener.service';

@Module({
  imports: [PrismaModule, PipelineModule],
  providers: [TgListenerService],
  exports: [TgListenerService],
})
export class TgListenerModule {}
