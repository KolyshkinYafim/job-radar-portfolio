import { Injectable } from '@nestjs/common';
import type { RawVacancy } from '../../common/types';
import { BaseHttpCollector } from '../base-http.collector';

const BASE_URL = 'https://www.arbeitnow.com/api/job-board-api';
const MAX_PAGES = 3;

interface ArbeitnowJob {
  slug?: string;
  title?: string;
  company_name?: string;
  url?: string;
  location?: string;
  remote?: boolean;
  tags?: string[];
  job_types?: string[];
  description?: string;
  created_at?: number;
}

interface ArbeitnowResponse {
  data?: ArbeitnowJob[];
  links?: { next?: string | null };
}

@Injectable()
export class ArbeitnowCollector extends BaseHttpCollector {
  readonly name = 'arbeitnow';

  async collect(): Promise<RawVacancy[]> {
    const all: RawVacancy[] = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      const data = await this.fetchJson<ArbeitnowResponse>(
        `${BASE_URL}?page=${page}`,
      );
      if (!data) break;

      const jobs = data.data ?? [];
      if (jobs.length === 0) break;

      for (const job of jobs) {
        all.push({
          source: 'arbeitnow',
          externalId: job.slug,
          url: job.url,
          title: job.title,
          company: job.company_name,
          rawText: [job.title, job.company_name, job.location, job.description]
            .filter(Boolean)
            .join('\n\n'),
          stack: job.tags ?? [],
          remote: job.remote ? 'remote-eu' : 'onsite',
          postedAt: job.created_at
            ? new Date(job.created_at * 1000)
            : undefined,
        });
      }

      if (!data.links?.next) break;
    }

    this.logger.log(`Arbeitnow: fetched ${all.length} jobs`);
    return all;
  }
}
