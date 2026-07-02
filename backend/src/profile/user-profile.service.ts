import { Injectable } from '@nestjs/common';
import { UserProfile } from '@prisma/client';
import type { ProfileDraft } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

export type ProfilePatch = Partial<{
  cvText: string;
  coreStack: string[];
  strongPlus: string[];
  redFlags: string[];
  seniority: string | null;
  locationPref: string[];
  salaryMin: number | null;
  salaryTarget: number | null;
}>;

@Injectable()
export class UserProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getByUserId(userId: string): Promise<UserProfile | null> {
    return this.prisma.userProfile.findUnique({ where: { userId } });
  }

  async upsert(userId: string, patch: ProfilePatch): Promise<UserProfile> {
    const existing = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    if (!existing) {
      return this.prisma.userProfile.create({
        data: {
          userId,
          cvText: patch.cvText ?? '',
          coreStack: patch.coreStack ?? [],
          strongPlus: patch.strongPlus ?? [],
          redFlags: patch.redFlags ?? [],
          seniority: patch.seniority ?? null,
          locationPref: patch.locationPref ?? [],
          salaryMin: patch.salaryMin ?? null,
          salaryTarget: patch.salaryTarget ?? null,
        },
      });
    }

    if (Object.keys(patch).length === 0) {
      return existing;
    }

    return this.prisma.userProfile.update({
      where: { userId },
      data: patch,
    });
  }

  async createFromDraft(
    userId: string,
    draft: ProfileDraft,
    cvText = '',
  ): Promise<UserProfile> {
    return this.upsert(userId, {
      cvText,
      coreStack: draft.coreStack,
      strongPlus: draft.strongPlus,
      redFlags: draft.redFlags,
      seniority: draft.seniority ?? null,
      locationPref: draft.locationPref,
      salaryMin: draft.salaryMin ?? null,
      salaryTarget: draft.salaryTarget ?? null,
    });
  }
}
