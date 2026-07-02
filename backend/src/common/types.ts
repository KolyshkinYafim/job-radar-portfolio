export const VacancyStatus = {
  New: 'new',
  FilteredOut: 'filtered_out',
  Queued: 'queued',
  Scored: 'scored',
  Notified: 'notified',
  Error: 'error',
} as const;
export type VacancyStatus = (typeof VacancyStatus)[keyof typeof VacancyStatus];

export type RemoteMode =
  | 'remote-eu'
  | 'remote-global'
  | 'hybrid'
  | 'onsite'
  | 'unknown';

export type Seniority = 'junior' | 'mid' | 'senior' | 'lead' | 'unknown';

export interface RawVacancy {
  source: string;
  externalId?: string;
  url?: string;
  title?: string;
  company?: string;
  rawText: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  stack?: string[];
  remote?: RemoteMode;
  seniority?: Seniority;
  postedAt?: Date;
}

export interface NormalizedVacancy {
  source: string;
  externalId: string | null;
  url: string | null;
  title: string;
  company: string | null;
  rawText: string;
  stack: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  remote: RemoteMode;
  seniority: Seniority;
  dedupHash: string;
  postedAt: Date | null;
}

export interface HardFilterResult {
  passed: boolean;
  reasons: string[];
}

export interface CandidateProfile {
  name: string;
  seniority: string;
  location_preference: string[];
  core_stack: string[];
  strong_plus: string[];
  red_flags: string[];
  salary_target: {
    base_eur_min: number;
    base_eur_target: number;
    base_eur_stretch_ai: number;
  };
  company_tiers: {
    tier1_boost: string[];
    tier2: string[];
  };
  notes: string;
}

export interface ProfileDraft {
  coreStack: string[];
  strongPlus: string[];
  redFlags: string[];
  seniority?: string;
  locationPref: string[];
  salaryMin?: number;
  salaryTarget?: number;
}

export interface ScoreResult {
  score: number;
  location: string;
  reasonsPro: string[];
  reasonsCon: string[];
  stackMatch: string[];
  redFlags: string[];
  model: string;
  latencyMs: number;
}

export const SCORING_QUEUE = 'scoring';

export interface ScoringJobData {
  vacancyId: string;
  userId: string;
}

export const COLLECTOR_QUEUE = 'collect';

export interface CollectorJobData {
  collector: string;
}

export const INGESTOR = 'INGESTOR';

export interface IngestOutcome {
  outcome: 'queued' | 'duplicate' | 'filtered_out' | 'error';
  vacancyId?: string;
  reasons?: string[];
}

export interface Ingestor {
  ingest(raw: RawVacancy): Promise<IngestOutcome>;
}

export const VACANCY_NOTIFIER = 'VACANCY_NOTIFIER';

export interface ScoredVacancyView {
  id: string;
  title: string;
  company: string | null;
  url: string | null;
  source: string;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  remote: string | null;
}

export interface VacancyNotifier {
  notifyScored(vacancy: ScoredVacancyView, score: ScoreResult): Promise<void>;
}
