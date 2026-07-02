import { Injectable } from '@nestjs/common';
import type { RawVacancy, RemoteMode, Seniority } from '../../common/types';
import { BaseHttpCollector } from '../base-http.collector';

const BASE_URL = 'https://jobicy.com/api/v2/remote-jobs';

interface JobicyJob {
  id?: number;
  url?: string;
  jobSlug?: string;
  jobTitle?: string;
  companyName?: string;
  jobIndustry?: string[];
  jobType?: string[];
  jobGeo?: string;
  jobLevel?: string;
  jobExcerpt?: string;
  jobDescription?: string;
  pubDate?: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: string | null;
}

interface JobicyResponse {
  jobs?: JobicyJob[];
}

function mapSeniority(level: string | undefined): Seniority {
  if (!level) return 'unknown';
  const l = level.toLowerCase();
  if (
    l.includes('senior') ||
    l.includes('lead') ||
    l.includes('principal') ||
    l.includes('staff')
  )
    return 'senior';
  if (l.includes('junior') || l.includes('entry')) return 'junior';
  if (l.includes('mid')) return 'mid';
  return 'unknown';
}

function mapRemote(geo: string | undefined): RemoteMode {
  if (!geo) return 'remote-global';
  const g = geo.toLowerCase();
  if (g.includes('europe') || g.includes('eu') || g.includes('emea'))
    return 'remote-eu';
  return 'remote-global';
}

function salaryMonthly(
  value: number | null | undefined,
  period: string | null | undefined,
): number | undefined {
  if (!value) return undefined;
  if (!period || period === 'month') return value;
  if (period === 'year' || period === 'annual') return Math.round(value / 12);
  return value;
}

@Injectable()
export class JobicyCollector extends BaseHttpCollector {
  readonly name = 'jobicy';

  async collect(): Promise<RawVacancy[]> {
    const all: RawVacancy[] = [];

    for (const geo of ['europe', 'worldwide']) {
      const url = `${BASE_URL}?count=50&geo=${geo}&industry=dev`;
      const data = await this.fetchJson<JobicyResponse>(url);
      if (!data) continue;

      const jobs = data.jobs ?? [];
      this.logger.log(`Jobicy [${geo}]: fetched ${jobs.length} jobs`);

      for (const job of jobs) {
        all.push({
          source: 'jobicy',
          externalId: job.id?.toString(),
          url: job.url,
          title: job.jobTitle,
          company: job.companyName,
          rawText: [
            job.jobTitle,
            job.companyName,
            job.jobGeo,
            job.jobExcerpt,
            job.jobDescription,
          ]
            .filter(Boolean)
            .join('\n\n'),
          salaryMin: salaryMonthly(job.salaryMin, job.salaryPeriod),
          salaryMax: salaryMonthly(job.salaryMax, job.salaryPeriod),
          currency: job.salaryCurrency ?? undefined,
          stack: job.jobIndustry ?? [],
          remote: mapRemote(job.jobGeo),
          seniority: mapSeniority(job.jobLevel),
          postedAt: job.pubDate ? new Date(job.pubDate) : undefined,
        });
      }
    }

    return all;
  }
}
