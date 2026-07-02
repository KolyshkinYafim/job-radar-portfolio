import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import type { UserProfile } from '@prisma/client';
import type { CandidateProfile } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { UserProfileService } from '../profile/user-profile.service';
import { SettingsService } from './settings.service';

const mockPrisma = {
  sourceConfig: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  vacancy: { groupBy: jest.fn() },
  channel: {
    findMany: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
};
const mockUserProfiles = {
  getByUserId: jest.fn(),
  upsert: jest.fn(),
};
const configValues: Record<string, unknown> = {
  scoringThreshold: 65,
  OWNER_USER_ID: 'owner-cuid',
};
const mockConfig = { get: jest.fn((key: string) => configValues[key]) };

function makeUserProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'p1',
    userId: 'owner-cuid',
    cvText: '',
    coreStack: ['TypeScript', 'NestJS'],
    strongPlus: ['AI integration'],
    redFlags: ['junior'],
    seniority: 'senior',
    locationPref: ['EU remote'],
    salaryMin: 75000,
    salaryTarget: 85000,
    updatedAt: new Date('2026-06-13T00:00:00Z'),
    ...overrides,
  };
}

describe('SettingsService', () => {
  let service: SettingsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.sourceConfig.findMany.mockResolvedValue([]);
    mockPrisma.vacancy.groupBy.mockResolvedValue([]);
    mockConfig.get.mockImplementation((key: string) => configValues[key]);

    const module = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: UserProfileService, useValue: mockUserProfiles },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get(SettingsService);
  });

  it('lists all collectors as enabled by default with vacancy counts', async () => {
    mockPrisma.vacancy.groupBy.mockResolvedValue([
      { source: 'greenhouse/acme-analytics', _count: { id: 10 } },
      { source: 'greenhouse/ridgeline-data', _count: { id: 5 } },
      { source: 'remoteok', _count: { id: 3 } },
    ]);

    const sources = await service.listSources();
    const greenhouse = sources.find((s) => s.name === 'greenhouse');
    const remoteok = sources.find((s) => s.name === 'remoteok');

    expect(sources).toHaveLength(21);
    expect(greenhouse).toEqual({
      name: 'greenhouse',
      enabled: true,
      count: 15,
    });
    expect(remoteok).toEqual({ name: 'remoteok', enabled: true, count: 3 });
    expect(sources.every((s) => s.enabled)).toBe(true);
  });

  it('reflects a disabled source from config', async () => {
    mockPrisma.sourceConfig.findMany.mockResolvedValue([
      { name: 'greenhouse', enabled: false },
    ]);

    const sources = await service.listSources();
    expect(sources.find((s) => s.name === 'greenhouse')?.enabled).toBe(false);
  });

  it('rejects toggling an unknown source', async () => {
    await expect(service.setSourceEnabled('nope', false)).rejects.toThrow(
      'Unknown source',
    );
    expect(mockPrisma.sourceConfig.upsert).not.toHaveBeenCalled();
  });

  it('toggles a known source', async () => {
    await service.setSourceEnabled('remoteok', false);
    expect(mockPrisma.sourceConfig.upsert).toHaveBeenCalledWith({
      where: { name: 'remoteok' },
      create: { name: 'remoteok', enabled: false },
      update: { enabled: false },
    });
  });

  it('normalizes a channel handle without @ when adding', async () => {
    mockPrisma.channel.upsert.mockResolvedValue({ handle: '@devs' });
    await service.addChannel('devs');
    expect(mockPrisma.channel.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { handle: '@devs' } }),
    );
  });

  it('isSourceEnabled defaults to true when no row exists', async () => {
    mockPrisma.sourceConfig.findUnique.mockResolvedValue(null);
    await expect(service.isSourceEnabled('lever')).resolves.toBe(true);
  });

  describe('getProfile', () => {
    it('returns snake_case profile and threshold for the owner', async () => {
      mockUserProfiles.getByUserId.mockResolvedValue(makeUserProfile());

      const result = await service.getProfile();

      expect(mockUserProfiles.getByUserId).toHaveBeenCalledWith('owner-cuid');
      expect(result.threshold).toBe(65);
      expect(result.profile).toEqual(
        expect.objectContaining({
          seniority: 'senior',
          core_stack: ['TypeScript', 'NestJS'],
          strong_plus: ['AI integration'],
          red_flags: ['junior'],
          location_preference: ['EU remote'],
          salary_target: expect.objectContaining({
            base_eur_min: 75000,
            base_eur_target: 85000,
          }),
        }),
      );
    });

    it('throws NotFound when the owner profile is missing', async () => {
      mockUserProfiles.getByUserId.mockResolvedValue(null);
      await expect(service.getProfile()).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('updateProfile', () => {
    it('maps snake_case payload to camelCase patch and returns the snake_case form back', async () => {
      const payload: CandidateProfile = {
        name: 'ignored',
        seniority: 'senior',
        location_preference: ['EU remote', 'Amsterdam hybrid'],
        core_stack: ['TypeScript', 'NestJS'],
        strong_plus: ['AI integration'],
        red_flags: ['junior-only'],
        salary_target: {
          base_eur_min: 80000,
          base_eur_target: 95000,
          base_eur_stretch_ai: 120000,
        },
        company_tiers: { tier1_boost: [], tier2: [] },
        notes: 'ignored',
      };
      const updated = makeUserProfile({
        coreStack: payload.core_stack,
        strongPlus: payload.strong_plus,
        redFlags: payload.red_flags,
        locationPref: payload.location_preference,
        salaryMin: 80000,
        salaryTarget: 95000,
      });
      mockUserProfiles.upsert.mockResolvedValue(updated);

      const result = await service.updateProfile(payload);

      expect(mockUserProfiles.upsert).toHaveBeenCalledWith('owner-cuid', {
        coreStack: ['TypeScript', 'NestJS'],
        strongPlus: ['AI integration'],
        redFlags: ['junior-only'],
        seniority: 'senior',
        locationPref: ['EU remote', 'Amsterdam hybrid'],
        salaryMin: 80000,
        salaryTarget: 95000,
      });
      expect(result).toEqual(
        expect.objectContaining({
          seniority: 'senior',
          core_stack: ['TypeScript', 'NestJS'],
          salary_target: expect.objectContaining({
            base_eur_min: 80000,
            base_eur_target: 95000,
          }),
        }),
      );
    });
  });
});
