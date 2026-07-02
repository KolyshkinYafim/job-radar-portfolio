import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CollectionSchedulerService } from '../collectors/collection-scheduler.service';
import { OwnerGuard } from '../auth/owner.guard';

@Controller('api/collect')
@UseGuards(OwnerGuard)
export class CollectController {
  constructor(private readonly scheduler: CollectionSchedulerService) {}

  @Post()
  trigger() {
    const result = this.scheduler.triggerManual();
    return {
      ...result,
      running: this.scheduler.isRunning(),
      lastRun: this.scheduler.getLastRun(),
    };
  }

  @Get('status')
  status() {
    return {
      running: this.scheduler.isRunning(),
      lastRun: this.scheduler.getLastRun(),
    };
  }
}
