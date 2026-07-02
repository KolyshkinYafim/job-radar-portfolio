import { UserProfile } from '@prisma/client';
import { userProfileToCandidate } from './user-profile.mapper';

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'p1',
    userId: 'u1',
    cvText: '',
    coreStack: [],
    strongPlus: [],
    redFlags: [],
    seniority: null,
    locationPref: [],
    salaryMin: null,
    salaryTarget: null,
    updatedAt: new Date('2026-06-13T00:00:00Z'),
    ...overrides,
  };
}

describe('userProfileToCandidate', () => {
  it('maps a fully populated UserProfile to CandidateProfile (camelCase → snake_case)', () => {
    const profile = makeProfile({
      coreStack: ['TypeScript', 'NestJS'],
      strongPlus: ['GraphQL'],
      redFlags: ['PHP-only'],
      seniority: 'senior',
      locationPref: ['EU remote', 'Amsterdam hybrid'],
      salaryMin: 75000,
      salaryTarget: 85000,
    });

    expect(userProfileToCandidate(profile)).toEqual({
      name: '',
      seniority: 'senior',
      location_preference: ['EU remote', 'Amsterdam hybrid'],
      core_stack: ['TypeScript', 'NestJS'],
      strong_plus: ['GraphQL'],
      red_flags: ['PHP-only'],
      salary_target: {
        base_eur_min: 75000,
        base_eur_target: 85000,
        base_eur_stretch_ai: 0,
      },
      company_tiers: { tier1_boost: [], tier2: [] },
      notes: '',
    });
  });

  it('falls back to safe defaults when optional fields are null', () => {
    const profile = makeProfile({
      coreStack: ['Go'],
      seniority: null,
      salaryMin: null,
      salaryTarget: null,
    });

    const result = userProfileToCandidate(profile);

    expect(result.seniority).toBe('');
    expect(result.salary_target).toEqual({
      base_eur_min: 0,
      base_eur_target: 0,
      base_eur_stretch_ai: 0,
    });
    expect(result.core_stack).toEqual(['Go']);
  });

  it('preserves empty arrays without inventing values', () => {
    const profile = makeProfile({
      coreStack: [],
      strongPlus: [],
      redFlags: [],
      locationPref: [],
    });

    const result = userProfileToCandidate(profile);

    expect(result.core_stack).toEqual([]);
    expect(result.strong_plus).toEqual([]);
    expect(result.red_flags).toEqual([]);
    expect(result.location_preference).toEqual([]);
    expect(result.company_tiers).toEqual({ tier1_boost: [], tier2: [] });
  });
});
