import { UserProfile } from '@prisma/client';
import { CandidateProfile } from '../common/types';
import type { ProfilePatch } from '../profile/user-profile.service';

export function userProfileToCandidate(profile: UserProfile): CandidateProfile {
  return {
    name: '',
    seniority: profile.seniority ?? '',
    location_preference: profile.locationPref,
    core_stack: profile.coreStack,
    strong_plus: profile.strongPlus,
    red_flags: profile.redFlags,
    salary_target: {
      base_eur_min: profile.salaryMin ?? 0,
      base_eur_target: profile.salaryTarget ?? 0,
      base_eur_stretch_ai: 0,
    },
    company_tiers: {
      tier1_boost: [],
      tier2: [],
    },
    notes: '',
  };
}

export function candidateToProfilePatch(
  candidate: CandidateProfile,
): ProfilePatch {
  return {
    coreStack: candidate.core_stack,
    strongPlus: candidate.strong_plus,
    redFlags: candidate.red_flags,
    seniority: candidate.seniority || null,
    locationPref: candidate.location_preference,
    salaryMin: candidate.salary_target?.base_eur_min || null,
    salaryTarget: candidate.salary_target?.base_eur_target || null,
  };
}
