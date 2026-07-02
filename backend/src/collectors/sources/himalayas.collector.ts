import { Injectable } from '@nestjs/common';
import type { RawVacancy, RemoteMode, Seniority } from '../../common/types';
import { BaseHttpCollector } from '../base-http.collector';

const BASE_URL = 'https://himalayas.app/jobs/api';
const PAGE_SIZE = 100;

interface HimalayasJob {
  id?: string;
  title?: string;
  companyName?: string;
  applicationLink?: string;
  minSalary?: number;
  maxSalary?: number;
  currency?: string;
  salaryPeriod?: string;
  locationRestrictions?: string[];
  timezoneRestrictions?: string[];
  seniority?: string[];
  categories?: string[];
  pubDate?: number;
  description?: string;
  excerpt?: string;
}

interface HimalayasResponse {
  jobs?: HimalayasJob[];
}

function mapRemote(restrictions: string[] | undefined): RemoteMode {
  if (!restrictions || restrictions.length === 0) return 'remote-global';
  const joined = restrictions.join(' ').toLowerCase();
  if (
    joined.includes('europe') ||
    joined.includes('eu') ||
    joined.includes('poland')
  ) {
    return 'remote-eu';
  }
  return 'remote-global';
}

function mapSeniority(levels: string[] | undefined): Seniority {
  if (!levels?.length) return 'unknown';
  const joined = levels.join(' ').toLowerCase();
  if (
    joined.includes('senior') ||
    joined.includes('lead') ||
    joined.includes('principal')
  )
    return 'senior';
  if (joined.includes('junior') || joined.includes('entry')) return 'junior';
  if (joined.includes('mid') || joined.includes('middle')) return 'mid';
  return 'unknown';
}

function salaryMonthly(
  value: number | undefined,
  period: string | undefined,
): number | undefined {
  if (!value) return undefined;
  if (!period || period === 'monthly') return value;
  if (period === 'yearly' || period === 'annual') return Math.round(value / 12);
  return value;
}

@Injectable()
export class HimalayasCollector extends BaseHttpCollector {
  readonly name = 'himalayas';

  async collect(): Promise<RawVacancy[]> {
    const data = await this.fetchJson<HimalayasResponse>(
      `${BASE_URL}?limit=${PAGE_SIZE}`,
    );
    if (!data) {
      return [];
    }

    const jobs = data.jobs ?? [];
    this.logger.log(`Himalayas: fetched ${jobs.length} jobs`);

    return jobs.map(
      (job): RawVacancy => ({
        source: 'himalayas',
        externalId: job.id,
        url: job.applicationLink,
        title: job.title,
        company: job.companyName,
        rawText: [job.title, job.companyName, job.excerpt, job.description]
          .filter(Boolean)
          .join('\n\n'),
        salaryMin: salaryMonthly(job.minSalary, job.salaryPeriod),
        salaryMax: salaryMonthly(job.maxSalary, job.salaryPeriod),
        currency: job.currency ?? 'USD',
        stack: job.categories ?? [],
        remote: mapRemote(job.locationRestrictions),
        seniority: mapSeniority(job.seniority),
        postedAt: job.pubDate ? new Date(job.pubDate * 1000) : undefined,
      }),
    );
  }
}
