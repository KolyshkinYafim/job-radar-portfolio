import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileDraft } from '../common/types';
import { UserProfileService } from './user-profile.service';

const mockProfile = {
  id: 'p1',
  userId: 'u1',
  cvText: 'my cv',
  coreStack: ['TypeScript', 'NestJS'],
  strongPlus: ['GraphQL'],
  redFlags: ['PHP'],
  seniority: 'senior',
  locationPref: ['EU'],
  salaryMin: 4000,
  salaryTarget: 6000,
  updatedAt: new Date(),
};

const mockPrisma = {
  userProfile: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

describe('UserProfileService', () => {
  let service: UserProfileService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        UserProfileService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(UserProfileService);
  });

  describe('getByUserId', () => {
    it('returns profile when it exists', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValue(mockProfile);
      const result = await service.getByUserId('u1');
      expect(result).toBe(mockProfile);
      expect(mockPrisma.userProfile.findUnique).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
    });

    it('returns null when profile does not exist', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValue(null);
      const result = await service.getByUserId('u1');
      expect(result).toBeNull();
    });
  });

  describe('upsert', () => {
    it('creates with defaults when profile does not exist', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValue(null);
      mockPrisma.userProfile.create.mockResolvedValue(mockProfile);

      await service.upsert('u1', { cvText: 'cv', coreStack: ['TS'] });

      expect(mockPrisma.userProfile.create).toHaveBeenCalledWith({
        data: {
          userId: 'u1',
          cvText: 'cv',
          coreStack: ['TS'],
          strongPlus: [],
          redFlags: [],
          seniority: null,
          locationPref: [],
          salaryMin: null,
          salaryTarget: null,
        },
      });
    });

    it('updates only the provided fields when profile exists', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValue(mockProfile);
      mockPrisma.userProfile.update.mockResolvedValue({
        ...mockProfile,
        cvText: 'updated cv',
      });

      await service.upsert('u1', { cvText: 'updated cv' });

      expect(mockPrisma.userProfile.update).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: { cvText: 'updated cv' },
      });
      expect(mockPrisma.userProfile.create).not.toHaveBeenCalled();
    });

    it('returns existing profile without calling update when patch is empty', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValue(mockProfile);

      const result = await service.upsert('u1', {});

      expect(result).toBe(mockProfile);
      expect(mockPrisma.userProfile.update).not.toHaveBeenCalled();
    });
  });

  describe('createFromDraft', () => {
    const draft: ProfileDraft = {
      coreStack: ['TypeScript', 'Vue'],
      strongPlus: ['NestJS'],
      redFlags: ['jQuery'],
      seniority: 'mid',
      locationPref: ['Remote EU'],
      salaryMin: 3000,
      salaryTarget: 5000,
    };

    it('maps ProfileDraft to UserProfile fields with empty cvText fallback', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValue(null);
      mockPrisma.userProfile.create.mockResolvedValue(mockProfile);

      await service.createFromDraft('u1', draft);

      expect(mockPrisma.userProfile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'u1',
          cvText: '',
          coreStack: draft.coreStack,
          strongPlus: draft.strongPlus,
          redFlags: draft.redFlags,
          seniority: 'mid',
          locationPref: draft.locationPref,
          salaryMin: 3000,
          salaryTarget: 5000,
        }),
      });
    });

    it('uses provided cvText when given', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValue(null);
      mockPrisma.userProfile.create.mockResolvedValue(mockProfile);

      await service.createFromDraft('u1', draft, 'My full CV text');

      expect(mockPrisma.userProfile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ cvText: 'My full CV text' }),
      });
    });
  });
});
