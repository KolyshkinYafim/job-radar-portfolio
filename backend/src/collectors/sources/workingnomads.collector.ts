import { Injectable } from '@nestjs/common';
import type { RawVacancy } from '../../common/types';
import { BaseHttpCollector } from '../base-http.collector';
import { stripHtml } from '../html';

const BASE_URL = 'https://www.workingnomads.com/api/exposed_jobs/';

interface WorkingNomadsJob {
  url?: string;
  title?: string;
  description?: string;
  company_name?: string;
  category_name?: string;
  tags?: string | string[];
  location?: string;
  pub_date?: string;
}

function normalizeTags(tags: string | string[] | undefined): string[] {
  if (Array.isArray(tags)) {
    return tags.map((tag) => tag.trim()).filter(Boolean);
  }
  if (typeof tags === 'string') {
    return tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return [];
}

function extractExternalId(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return /\/job\/go\/(\d+)\//.exec(url)?.[1] ?? url;
}

@Injectable()
export class WorkingNomadsCollector extends BaseHttpCollector {
  readonly name = 'workingnomads';

  async collect(): Promise<RawVacancy[]> {
    const body = await this.fetchJson<WorkingNomadsJob[]>(BASE_URL);
    if (!body) {
      return [];
    }
    const jobs = Array.isArray(body) ? body : [];

    this.logger.log(`WorkingNomads: fetched ${jobs.length} jobs`);

    const vacancies: RawVacancy[] = [];
    for (const job of jobs) {
      try {
        vacancies.push({
          source: 'workingnomads',
          externalId: extractExternalId(job.url),
          url: job.url,
          title: job.title,
          company: job.company_name,
          rawText: [
            job.title,
            job.company_name,
            job.location,
            job.description ? stripHtml(job.description) : undefined,
          ]
            .filter(Boolean)
            .join('\n\n'),
          stack: normalizeTags(job.tags),
          remote: 'remote-global',
          postedAt: job.pub_date ? new Date(job.pub_date) : undefined,
        });
      } catch (error) {
        this.logger.warn(
          `Skipping malformed WorkingNomads job ${job.url ?? '<unknown>'}: ${String(error)}`,
        );
      }
    }
    return vacancies;
  }
}
