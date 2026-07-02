import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { CandidateProfile } from '../common/types';
import { OwnerGuard } from '../auth/owner.guard';
import { SettingsService } from './settings.service';

@Controller('api/settings')
@UseGuards(OwnerGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('sources')
  sources() {
    return this.settings.listSources();
  }

  @Patch('sources/:name')
  setSource(@Param('name') name: string, @Body() body: { enabled: boolean }) {
    return this.settings.setSourceEnabled(name, body.enabled);
  }

  @Get('channels')
  channels() {
    return this.settings.listChannels();
  }

  @Post('channels')
  addChannel(@Body() body: { handle: string }) {
    if (!body.handle?.trim()) {
      throw new BadRequestException('handle is required');
    }
    return this.settings.addChannel(body.handle.trim());
  }

  @Delete('channels/:handle')
  removeChannel(@Param('handle') handle: string) {
    return this.settings.removeChannel(handle);
  }

  @Get('profile')
  profile() {
    return this.settings.getProfile();
  }

  @Put('profile')
  updateProfile(@Body() body: CandidateProfile) {
    return this.settings.updateProfile(body);
  }
}
