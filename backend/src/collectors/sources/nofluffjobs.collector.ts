import { Injectable } from '@nestjs/common';
import type { RawVacancy, RemoteMode, Seniority } from '../../common/types';
import { BaseHttpCollector } from '../base-http.collector';

const BASE_URL =
  'https://nofluffjobs.com/api/search/posting?pageSize=100&offset=0&salaryCurrency=PLN&salaryPeriod=month&region=pl';
const JOB_BASE_URL = 'https://nofluffjobs.com/job';

interface NoFluffPlace {
  city?: string;
  country?: { name?: string; code?: string };
}

interface NoFluffSalary {
  from?: number;
  to?: number;
  currency?: string;
  type?: string;
}

interface NoFluffPosting {
  id?: string;
  name?: string;
  title?: string;
  url?: string;
  category?: string;
  seniority?: string | string[];
  location?: { places?: NoFluffPlace[]; fullyRemote?: boolean };
  salary?: NoFluffSalary;
  posted?: number;
}

interface NoFluffResponse {
  postings?: NoFluffPosting[];
}

function normalizeSeniority(value: string | string[] | undefined): Seniority {
  const text = (
    Array.isArray(value) ? value.join(' ') : (value ?? '')
  ).toLowerCase();
  if (/senior|lead|principal/.test(text)) return 'senior';
  if (/mid|regular/.test(text)) return 'mid';
  if (/junior|trainee|intern/.test(text)) return 'junior';
  return 'unknown';
}

@Injectable()
export class NoFluffJobsCollector extends BaseHttpCollector {
  readonly name = 'nofluffjobs';
  protected readonly timeoutMs = 20_000;

  async collect(): Promise<RawVacancy[]> {
    const data = await this.postJson<NoFluffResponse>(BASE_URL, {
      rawSearch: '',
    });
    if (!data) {
      return [];
    }

    const postings = data.postings ?? [];
    this.logger.log(`nofluffjobs: fetched ${postings.length} postings`);

    return postings.map((posting): RawVacancy => {
      const cities = (posting.location?.places ?? [])
        .map((place) => place.city)
        .filter(Boolean);
      const salary = posting.salary ?? {};
      const salaryText =
        salary.from !== undefined || salary.to !== undefined
          ? [salary.from, salary.to].filter((v) => v !== undefined).join('-') +
            ` ${salary.currency ?? ''}`.trimEnd()
          : undefined;
      const inAmsterdam = cities.some((city) => /amsterdam/i.test(city ?? ''));
      const remote: RemoteMode =
        posting.location?.fullyRemote === true
          ? 'remote-eu'
          : inAmsterdam
            ? 'hybrid'
            : 'onsite';

      return {
        source: 'nofluffjobs',
        externalId: posting.id?.toString(),
        url: posting.url ? `${JOB_BASE_URL}/${posting.url}` : undefined,
        title: posting.title,
        company: posting.name,
        rawText: [
          posting.title,
          posting.name,
          posting.category,
          ...cities,
          salaryText,
        ]
          .filter(Boolean)
          .join('\n\n'),
        salaryMin: salary.from,
        salaryMax: salary.to,
        currency: salary.currency,
        stack: [],
        remote,
        seniority: normalizeSeniority(posting.seniority),
        postedAt: posting.posted ? new Date(posting.posted) : undefined,
      };
    });
  }
}
