import { Module } from '@nestjs/common';
import { INGESTOR } from '../common/types';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { BacklogReconcilerService } from './backlog-reconciler.service';
import { IngestionService } from './ingestion.service';

@Module({
  imports: [PrismaModule, QueueModule],
  providers: [
    IngestionService,
    BacklogReconcilerService,
    { provide: INGESTOR, useExisting: IngestionService },
  ],
  exports: [INGESTOR, IngestionService],
})
export class PipelineModule {}
