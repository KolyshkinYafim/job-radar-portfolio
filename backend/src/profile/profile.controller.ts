import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ProfileParserService } from '../scoring/profile-parser.service';
import { type ProfilePatch, UserProfileService } from './user-profile.service';

const STRING_FIELDS = new Set<string>(['cvText']);
const STRING_OR_NULL_FIELDS = new Set<string>(['seniority']);
const STRING_ARRAY_FIELDS = new Set<string>([
  'coreStack',
  'strongPlus',
  'redFlags',
  'locationPref',
]);
const NUMBER_OR_NULL_FIELDS = new Set<string>(['salaryMin', 'salaryTarget']);
const ALLOWED_FIELDS = new Set<string>([
  ...STRING_FIELDS,
  ...STRING_OR_NULL_FIELDS,
  ...STRING_ARRAY_FIELDS,
  ...NUMBER_OR_NULL_FIELDS,
]);

function validatePatch(body: unknown): ProfilePatch {
  if (body === null || Array.isArray(body) || typeof body !== 'object') {
    throw new BadRequestException('body must be a plain object');
  }
  const raw = body as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  for (const key of Object.keys(raw)) {
    if (!ALLOWED_FIELDS.has(key)) continue;
    const val = raw[key];

    if (STRING_FIELDS.has(key)) {
      if (typeof val !== 'string') {
        throw new BadRequestException(`${key} must be a string`);
      }
      patch[key] = val;
    } else if (STRING_OR_NULL_FIELDS.has(key)) {
      if (val !== null && typeof val !== 'string') {
        throw new BadRequestException(`${key} must be a string or null`);
      }
      patch[key] = val;
    } else if (STRING_ARRAY_FIELDS.has(key)) {
      if (!Array.isArray(val) || val.some((item) => typeof item !== 'string')) {
        throw new BadRequestException(`${key} must be an array of strings`);
      }
      patch[key] = val;
    } else if (NUMBER_OR_NULL_FIELDS.has(key)) {
      if (val !== null && (typeof val !== 'number' || !Number.isFinite(val))) {
        throw new BadRequestException(`${key} must be a finite number or null`);
      }
      patch[key] = val;
    }
  }

  return patch;
}

@Controller('api/profile')
export class ProfileController {
  constructor(
    private readonly profiles: UserProfileService,
    private readonly profileParser: ProfileParserService,
  ) {}

  @Get()
  @UseGuards(AuthGuard)
  async getProfile(@CurrentUser() user: User) {
    const profile = await this.profiles.getByUserId(user.id);
    if (!profile) throw new NotFoundException('Profile not found');
    return profile;
  }

  @Put()
  @UseGuards(AuthGuard)
  async updateProfile(@CurrentUser() user: User, @Body() body: unknown) {
    const patch = validatePatch(body);
    return this.profiles.upsert(user.id, patch);
  }

  @Post('parse')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async parseCv(@CurrentUser() user: User, @Body() body: { cvText?: unknown }) {
    const cvText = body?.cvText;
    if (typeof cvText !== 'string' || cvText.trim().length === 0) {
      throw new BadRequestException('cvText required');
    }
    return this.profileParser.parseCv(cvText, user.id);
  }
}
