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
import { CurrentUser } from '../auth/current-user.decorator';
import { OwnerGuard } from '../auth/owner.guard';
import { VacanciesService } from './vacancies.service';

@Controller('api/vacancies')
@UseGuards(OwnerGuard)
export class GoldenLabelController {
  constructor(private readonly svc: VacanciesService) {}

  @Get('golden/queue')
  goldenQueue(@CurrentUser() user: User, @Query('limit') limit?: string) {
    return this.svc.goldenQueue(user.id, limit ? Number(limit) : undefined);
  }

  @Patch(':id/golden')
  setGoldenLabel(
    @Param('id') id: string,
    @Body() body: { label: string | null },
  ) {
    return this.svc.setGoldenLabel(id, body.label ?? null);
  }
}
