import { Injectable } from '@nestjs/common';
import { RawVacancy, RemoteMode } from '../../common/types';
import { BaseHttpCollector } from '../base-http.collector';
import { stripHtml } from '../html';

const API_URL = 'https://remoteok.com/api';

const RELEVANT_TAGS = new Set([
  'dev',
  'javascript',
  'typescript',
  'react',
  'node',
  'golang',
  'backend',
  'front end',
  'full stack',
]);

const EU_LOCATION_HINT = /\beurope\b|\beu\b|\bemea\b/i;

interface RemoteOkJob {
  id?: string | number;
  slug?: string;
  date?: string;
  company?: string;
  position?: string;
  tags?: string[];
  description?: string;
  location?: string;
  url?: string;
  apply_url?: string;
  salary_min?: number;
  salary_max?: number;
}

@Injectable()
export class RemoteOkCollector extends BaseHttpCollector {
  readonly name = 'remoteok';

  async collect(): Promise<RawVacancy[]> {
    const body = await this.fetchJson<RemoteOkJob[]>(API_URL);
    const jobs = Array.isArray(body) ? body : [];

    const vacancies: RawVacancy[] = [];
    for (const job of jobs) {
      try {
        if (!this.isRelevantJob(job)) {
          continue;
        }
        vacancies.push(this.mapJob(job));
      } catch (error) {
        this.logger.warn(
          `Skipping malformed RemoteOK job ${job?.id ?? '<unknown>'}: ${String(error)}`,
        );
      }
    }
    return vacancies;
  }

  private isRelevantJob(job: RemoteOkJob): boolean {
    if (!job || job.id === undefined || !job.position) {
      return false;
    }
    const tags = Array.isArray(job.tags) ? job.tags : [];
    return tags.some((tag) => RELEVANT_TAGS.has(String(tag).toLowerCase()));
  }

  private mapJob(job: RemoteOkJob): RawVacancy {
    const description = stripHtml(job.description ?? '');
    const tags = Array.isArray(job.tags)
      ? job.tags.map((tag) => String(tag))
      : [];
    const remote: RemoteMode = EU_LOCATION_HINT.test(job.location ?? '')
      ? 'remote-eu'
      : 'remote-global';
    const salaryMin =
      typeof job.salary_min === 'number' && job.salary_min > 0
        ? job.salary_min
        : undefined;
    const salaryMax =
      typeof job.salary_max === 'number' && job.salary_max > 0
        ? job.salary_max
        : undefined;
    const postedAt = job.date ? new Date(job.date) : undefined;

    return {
      source: this.name,
      externalId: String(job.id),
      url: job.url ?? job.apply_url,
      title: job.position,
      company: job.company,
      rawText:
        description ||
        `${job.position ?? ''} at ${job.company ?? 'unknown company'}. Tags: ${tags.join(', ')}`,
      salaryMin,
      salaryMax,
      currency:
        salaryMin !== undefined || salaryMax !== undefined ? 'USD' : undefined,
      stack: tags,
      remote,
      postedAt:
        postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : undefined,
    };
  }
}
