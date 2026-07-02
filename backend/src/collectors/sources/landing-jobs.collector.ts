import { Injectable } from '@nestjs/common';
import type { RawVacancy, RemoteMode } from '../../common/types';
import { BaseHttpCollector } from '../base-http.collector';

const BASE_URL = 'https://landing.jobs/api/v1/jobs';
const PAGE_SIZE = 100;
const MAX_PAGES = 3;

interface LandingJobLocation {
  city?: string;
  country_code?: string;
}

interface LandingJob {
  id?: number;
  title?: string;
  url?: string;
  currency_code?: string;
  gross_salary_low?: number | null;
  gross_salary_high?: number | null;
  published_at?: string;
  role_description?: string;
  main_requirements?: string;
  nice_to_have?: string;
  remote?: boolean;
  relocation_paid?: boolean;
  tags?: string[];
  locations?: LandingJobLocation[];
}

interface LandingResponse {
  jobs?: LandingJob[];
}

function mapRemote(job: LandingJob): RemoteMode {
  if (job.remote) {
    const locs = job.locations ?? [];
    const isEu = locs.some((l) => {
      const cc = (l.country_code ?? '').toUpperCase();
      return [
        'PL',
        'DE',
        'PT',
        'NL',
        'FR',
        'ES',
        'CZ',
        'RO',
        'UA',
        'EE',
        'LT',
        'LV',
      ].includes(cc);
    });
    return isEu ? 'remote-eu' : 'remote-global';
  }
  const locs = job.locations ?? [];
  const inAmsterdam = locs.some(
    (l) =>
      l.city?.toLowerCase().includes('amsterdam') ||
      (l.country_code?.toUpperCase() === 'NL' && !l.city),
  );
  return inAmsterdam ? 'hybrid' : 'onsite';
}

@Injectable()
export class LandingJobsCollector extends BaseHttpCollector {
  readonly name = 'landing.jobs';

  async collect(): Promise<RawVacancy[]> {
    const all: RawVacancy[] = [];

    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await this.fetchJson<LandingResponse>(
        `${BASE_URL}?limit=${PAGE_SIZE}&skip=${page * PAGE_SIZE}`,
      );
      if (!data) break;

      const jobs = data.jobs ?? [];
      if (jobs.length === 0) break;
      this.logger.log(`Landing.jobs page ${page}: fetched ${jobs.length} jobs`);

      for (const job of jobs) {
        all.push({
          source: 'landing.jobs',
          externalId: job.id?.toString(),
          url:
            job.url ??
            (job.id ? `https://landing.jobs/jobs/${job.id}` : undefined),
          title: job.title,
          company: undefined,
          rawText: [
            job.title,
            job.role_description,
            job.main_requirements,
            job.nice_to_have,
            job.tags?.join(', '),
          ]
            .filter(Boolean)
            .join('\n\n'),
          salaryMin: job.gross_salary_low ?? undefined,
          salaryMax: job.gross_salary_high ?? undefined,
          currency: job.currency_code ?? 'EUR',
          stack: job.tags ?? [],
          remote: mapRemote(job),
          postedAt: job.published_at ? new Date(job.published_at) : undefined,
        });
      }

      if (jobs.length < PAGE_SIZE) break;
    }

    return all;
  }
}
