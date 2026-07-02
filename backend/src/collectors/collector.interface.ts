import { RawVacancy } from '../common/types';

export const JOB_COLLECTORS = 'JOB_COLLECTORS';

export const COLLECTOR_NAMES = [
  'arbeitnow',
  'ashby',
  'euremotejobs',
  'greenhouse',
  'habr.career',
  'hackernews',
  'himalayas',
  'hirehi',
  'hirify',
  'jobicy',
  'jobspresso',
  'justjoin',
  'justremote',
  'landing.jobs',
  'lever',
  'nofluffjobs',
  'remoteok',
  'remoterocketship',
  'remotive',
  'workingnomads',
  'wwr',
] as const;

export interface JobCollector {
  readonly name: string;
  collect(): Promise<RawVacancy[]>;
}
