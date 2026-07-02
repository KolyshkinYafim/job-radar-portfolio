import { Injectable } from '@nestjs/common';
import type { RawVacancy } from '../../common/types';
import { BaseHttpCollector } from '../base-http.collector';

const BASE_URL = 'https://remotive.com/api/remote-jobs';

interface RemotiveJob {
  id?: number;
  title?: string;
  company_name?: string;
  url?: string;
  salary?: string;
  candidate_required_location?: string;
  tags?: string[];
  publication_date?: string;
  description?: string;
}

interface RemotiveResponse {
  jobs?: RemotiveJob[];
}

function parseSalary(raw: string | undefined): {
  min?: number;
  max?: number;
  currency?: string;
} {
  if (!raw) return {};
  const digits = raw.replace(/,/g, '');
  const currency = /EUR/i.test(raw) ? 'EUR' : /GBP/i.test(raw) ? 'GBP' : 'USD';
  const isAnnual = /year|annual|yr/i.test(raw);
  const kMul = /k/i.test(raw) ? 1000 : 1;

  const nums = [...digits.matchAll(/\d+(\.\d+)?/g)].map((m) => {
    const v = parseFloat(m[0]) * kMul;
    return isAnnual ? Math.round(v / 12) : v;
  });
  if (nums.length === 0) return {};
  if (nums.length === 1) return { min: nums[0], currency };
  return { min: Math.min(...nums), max: Math.max(...nums), currency };
}

@Injectable()
export class RemotiveCollector extends BaseHttpCollector {
  readonly name = 'remotive';

  async collect(): Promise<RawVacancy[]> {
    const data = await this.fetchJson<RemotiveResponse>(
      `${BASE_URL}?category=software-dev&limit=100`,
    );
    if (!data) {
      return [];
    }

    const jobs = data.jobs ?? [];
    this.logger.log(`Remotive: fetched ${jobs.length} jobs`);

    return jobs.map((job): RawVacancy => {
      const salary = parseSalary(job.salary);
      return {
        source: 'remotive',
        externalId: job.id?.toString(),
        url: job.url,
        title: job.title,
        company: job.company_name,
        rawText: [
          job.title,
          job.company_name,
          job.candidate_required_location,
          job.description,
        ]
          .filter(Boolean)
          .join('\n\n'),
        salaryMin: salary.min,
        salaryMax: salary.max,
        currency: salary.currency,
        stack: job.tags ?? [],
        remote: 'remote-global',
        postedAt: job.publication_date
          ? new Date(job.publication_date)
          : undefined,
      };
    });
  }
}
