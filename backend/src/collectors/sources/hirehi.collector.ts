import { Injectable } from '@nestjs/common';
import type { RawVacancy, Seniority } from '../../common/types';
import { BaseHttpCollector } from '../base-http.collector';

const BASE_URL = 'https://hirehi.ru/api/search/jobs';
const SITE_URL = 'https://hirehi.ru';
const PAGE_SIZE = 100;
const REMOTE_FORMAT = 'удалённо';

interface HirehiSalary {
  min?: number | null;
  max?: number | null;
  from?: number | null;
  to?: number | null;
  currency?: string | null;
}

interface HirehiJob {
  id?: number | string;
  title?: string;
  company?: string;
  format?: string;
  level?: string;
  salary?: string | HirehiSalary | null;
  salary_display?: string | null;
  category?: string;
  industry?: string;
  created_at?: string;
  company_icon?: string;
}

interface HirehiResponse {
  jobs?: HirehiJob[];
  has_more?: boolean;
  total_count?: number;
  page?: number;
  limit?: number;
}

const SENIORITY_RULES: ReadonlyArray<[RegExp, Seniority]> = [
  [/старш|lead|senior|head/i, 'senior'],
  [/средн|middle|mid/i, 'mid'],
  [/младш|junior|intern/i, 'junior'],
];

function deriveSeniority(level: string | undefined): Seniority {
  if (!level) return 'unknown';
  const match = SENIORITY_RULES.find(([pattern]) => pattern.test(level));
  return match ? match[1] : 'unknown';
}

function detectCurrency(raw: string): string | undefined {
  if (/₽|руб/i.test(raw)) return 'RUB';
  if (/\$|usd/i.test(raw)) return 'USD';
  if (/€|eur/i.test(raw)) return 'EUR';
  if (/₸|kzt/i.test(raw)) return 'KZT';
  return undefined;
}

function parseSalaryString(raw: string): {
  min?: number;
  max?: number;
  currency?: string;
} {
  const numbers = [...raw.matchAll(/\d[\d\s\u00a0]*\d|\d/g)]
    .map((m) => Number(m[0].replace(/[\s\u00a0]/g, '')))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (numbers.length === 0) return {};
  const currency = detectCurrency(raw);
  if (numbers.length === 1) return { min: numbers[0], currency };
  return { min: Math.min(...numbers), max: Math.max(...numbers), currency };
}

function parseSalary(
  salary: string | HirehiSalary | null | undefined,
  salaryDisplay: string | null | undefined,
): { min?: number; max?: number; currency?: string } {
  if (salary && typeof salary === 'object') {
    const min = salary.min ?? salary.from ?? undefined;
    const max = salary.max ?? salary.to ?? undefined;
    const currency = salary.currency ?? undefined;
    if (min != null || max != null) {
      return {
        min: min ?? undefined,
        max: max ?? undefined,
        currency: currency ?? undefined,
      };
    }
  }
  const text =
    (typeof salary === 'string' ? salary : undefined) ?? salaryDisplay ?? '';
  return text ? parseSalaryString(text) : {};
}

@Injectable()
export class HirehiCollector extends BaseHttpCollector {
  readonly name = 'hirehi';

  async collect(): Promise<RawVacancy[]> {
    const data = await this.fetchJson<HirehiResponse>(
      `${BASE_URL}?limit=${PAGE_SIZE}&page=1`,
    );
    if (!data) {
      return [];
    }

    const jobs = data.jobs ?? [];
    const remoteJobs = jobs.filter((job) => job.format === REMOTE_FORMAT);
    this.logger.log(
      `Hirehi: fetched ${jobs.length} jobs, ${remoteJobs.length} remote`,
    );

    return remoteJobs.map((job): RawVacancy => {
      const salary = parseSalary(job.salary, job.salary_display);
      const postedAt = job.created_at ? new Date(job.created_at) : undefined;
      return {
        source: this.name,
        externalId: String(job.id),
        url: this.buildUrl(job),
        title: job.title,
        company: job.company,
        rawText: [
          job.title,
          job.company,
          job.category,
          job.industry,
          job.salary_display,
        ]
          .filter(Boolean)
          .join('\n\n'),
        salaryMin: salary.min,
        salaryMax: salary.max,
        currency: salary.currency,
        remote: 'remote-global',
        seniority: deriveSeniority(job.level),
        postedAt:
          postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : undefined,
      };
    });
  }

  private buildUrl(job: HirehiJob): string {
    if (job.id == null) return `${SITE_URL}/`;
    const category = job.category ?? 'vacancy';
    return `${SITE_URL}/${category}/job-${job.id}`;
  }
}
