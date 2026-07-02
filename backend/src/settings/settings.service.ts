import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getOwnerUserId } from '../auth/current-user.helper';
import { COLLECTOR_NAMES } from '../collectors/collector.interface';
import type { CandidateProfile } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { UserProfileService } from '../profile/user-profile.service';
import {
  candidateToProfilePatch,
  userProfileToCandidate,
} from '../scoring/user-profile.mapper';

export interface SourceStatus {
  name: string;
  enabled: boolean;
  count: number;
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userProfiles: UserProfileService,
    private readonly config: ConfigService,
  ) {}

  async isSourceEnabled(name: string): Promise<boolean> {
    const row = await this.prisma.sourceConfig.findUnique({ where: { name } });
    return row?.enabled ?? true;
  }

  async listSources(): Promise<SourceStatus[]> {
    const [configs, counts] = await Promise.all([
      this.prisma.sourceConfig.findMany(),
      this.prisma.vacancy.groupBy({ by: ['source'], _count: { id: true } }),
    ]);
    const enabledByName = new Map(configs.map((c) => [c.name, c.enabled]));

    return COLLECTOR_NAMES.map((name) => {
      const count = counts
        .filter((c) => c.source === name || c.source.startsWith(`${name}/`))
        .reduce((sum, c) => sum + c._count.id, 0);
      return { name, enabled: enabledByName.get(name) ?? true, count };
    });
  }

  async setSourceEnabled(
    name: string,
    enabled: boolean,
  ): Promise<SourceStatus> {
    if (!COLLECTOR_NAMES.includes(name as (typeof COLLECTOR_NAMES)[number])) {
      throw new NotFoundException(`Unknown source: ${name}`);
    }
    await this.prisma.sourceConfig.upsert({
      where: { name },
      create: { name, enabled },
      update: { enabled },
    });
    const sources = await this.listSources();
    return sources.find((s) => s.name === name)!;
  }

  listChannels() {
    return this.prisma.channel.findMany({
      where: { kind: 'tg' },
      orderBy: { handle: 'asc' },
    });
  }

  async addChannel(handle: string) {
    const normalized = handle.startsWith('@') ? handle : `@${handle}`;
    return this.prisma.channel.upsert({
      where: { handle: normalized },
      create: { kind: 'tg', handle: normalized, enabled: true },
      update: { enabled: true },
    });
  }

  async removeChannel(handle: string) {
    const normalized = handle.startsWith('@') ? handle : `@${handle}`;
    await this.prisma.channel.deleteMany({ where: { handle: normalized } });
    return { handle: normalized, removed: true };
  }

  async getProfile(): Promise<{
    profile: CandidateProfile;
    threshold: number;
  }> {
    const ownerUserId = getOwnerUserId(this.config);
    const profile = await this.userProfiles.getByUserId(ownerUserId);
    if (!profile) {
      throw new NotFoundException('Owner profile not initialized');
    }
    return {
      profile: userProfileToCandidate(profile),
      threshold: this.config.get<number>('scoringThreshold') ?? 65,
    };
  }

  async updateProfile(profile: CandidateProfile): Promise<CandidateProfile> {
    const ownerUserId = getOwnerUserId(this.config);
    const updated = await this.userProfiles.upsert(
      ownerUserId,
      candidateToProfilePatch(profile),
    );
    return userProfileToCandidate(updated);
  }
}
