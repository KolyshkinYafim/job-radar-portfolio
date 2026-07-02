import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { VacanciesService } from './vacancies.service';
import type { VacancyListQuery } from './vacancies.service';

@Controller('api/feed')
@UseGuards(AuthGuard)
export class FeedController {
  constructor(private readonly svc: VacanciesService) {}

  @Get()
  list(@CurrentUser() user: User, @Query() q: VacancyListQuery) {
    return this.svc.list(user.id, q);
  }

  @Get('sources')
  sources() {
    return this.svc.sources();
  }

  @Get(':id')
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.findOne(user.id, id);
  }

  @Patch(':id/application')
  updateApplication(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    return this.svc.updateApplicationStatus(user.id, id, body.status);
  }
}
