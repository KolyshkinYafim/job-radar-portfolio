import type { CandidateProfile } from '../common/types';

export function buildScoringSystemPrompt(profile: CandidateProfile): string {
  return `You are an expert technical recruiter scoring job vacancies against one specific candidate profile.

CANDIDATE PROFILE:
${JSON.stringify(profile, null, 2)}

SCORING RUBRIC (0-100):
- 90-100: ideal — senior role on the candidate's core stack, remote EU or Amsterdam hybrid, plus AI/LLM product work or complex distributed systems.
- 70-89: strong — core stack overlaps heavily, location fits, no red flags.
- 50-69: partial — roughly half the stack overlaps, or location/seniority is unclear.
- 0-49: poor match.

HARD RULES (override the general impression):
- Junior or mid-only role: score at most 25.
- Onsite outside Amsterdam with no remote option: score at most 30.
- Core stack entirely outside the candidate's (e.g. Java/PHP-only, no TS/JS): score at most 40.
- Salary not mentioned: do NOT penalize.
- Base salary clearly below EUR 70k: subtract 15-20 points.
- Company is in tier1_boost: add 5-10 points and mention it in reasonsPro.

Also extract "location" as ONE short location of at most 5 words: the single most relevant city and country (e.g. "Berlin, Germany"), or the work mode if no city ("Remote EU", "Remote US", "Hybrid Amsterdam"). If several offices are listed, summarise (e.g. "Multiple US offices"). Never list every city, never add parenthetical notes or explanations.

Work step by step: first determine seniorityMatch, locationMatch, stack overlap and dealbreakers, then derive the final score from the rubric. Be strict and honest; when information is missing, answer "unclear" instead of guessing.

Keep every reason in reasonsPro/reasonsCon/redFlags to ONE short, concrete phrase of at most 12 words. No long sentences, no hedging clauses.`;
}

export const SCORING_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'vacancy_score',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        location: { type: 'string' },
        seniorityMatch: {
          type: 'string',
          enum: ['yes', 'no', 'unclear'],
        },
        locationMatch: {
          type: 'string',
          enum: [
            'remote-eu',
            'amsterdam-hybrid',
            'remote-global',
            'mismatch',
            'unclear',
          ],
        },
        stackMatch: { type: 'array', items: { type: 'string' } },
        dealbreaker: { type: 'boolean' },
        dealbreakerReason: { type: 'string' },
        score: { type: 'integer', minimum: 0, maximum: 100 },
        reasonsPro: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 3,
        },
        reasonsCon: {
          type: 'array',
          items: { type: 'string' },
          minItems: 0,
          maxItems: 3,
        },
        redFlags: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 3,
        },
      },
      required: [
        'location',
        'seniorityMatch',
        'locationMatch',
        'stackMatch',
        'dealbreaker',
        'dealbreakerReason',
        'score',
        'reasonsPro',
        'reasonsCon',
        'redFlags',
      ],
      additionalProperties: false,
    },
  },
} as const;

export interface ScoringRequestParams {
  model: string;
  profile: CandidateProfile;
  vacancyText: string;
  thinking: boolean;
}

export function buildScoringRequestBody(params: ScoringRequestParams) {
  const systemPrompt = buildScoringSystemPrompt(params.profile);
  const userPrompt = `VACANCY TEXT:\n${params.vacancyText}\n\nScore this vacancy against the profile.`;

  return {
    model: params.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: SCORING_RESPONSE_FORMAT,
    temperature: 0.2,
    ...(params.thinking
      ? {}
      : { chat_template_kwargs: { enable_thinking: false } }),
  };
}
