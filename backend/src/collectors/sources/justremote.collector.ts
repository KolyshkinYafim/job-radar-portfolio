import { Injectable } from '@nestjs/common';
import type { RawVacancy, RemoteMode } from '../../common/types';
import { BaseHttpCollector } from '../base-http.collector';

const PAGE_URL = 'https://justremote.co/';
const BASE_URL = 'https://justremote.co/';
const STATE_MARKER = 'window.__PRELOADED_STATE__';
const EU_HINT =
  /\beurope\b|\bemea\b|\beu\b|poland|germany|spain|portugal|netherlands|france|italy|ireland|sweden|united kingdom|\buk\b/i;

interface JrJob {
  id?: number | string;
  title?: string;
  company_name?: string;
  job_type?: string;
  category?: string;
  href?: string;
  remote_type?: string;
  job_country?: string | null;
  is_active?: boolean;
  location_restrictions?: string[];
}
interface JrState {
  jobsState?: { entity?: { all?: JrJob[] } };
  homeJobsState?: { entity?: { jobs?: JrJob[] } };
}

function sliceBalancedObject(s: string, start: number): string | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') {
      inStr = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

@Injectable()
export class JustRemoteCollector extends BaseHttpCollector {
  readonly name = 'justremote';

  async collect(): Promise<RawVacancy[]> {
    const html = await this.fetchText(PAGE_URL, { Accept: 'text/html' });
    if (html === null) {
      return [];
    }

    let jobs: JrJob[];
    try {
      jobs = this.extractJobs(html);
    } catch (error) {
      this.logger.warn(`JustRemote collection failed: ${String(error)}`);
      return [];
    }

    const vacancies: RawVacancy[] = [];
    for (const job of jobs) {
      try {
        const mapped = this.mapJob(job);
        if (mapped) vacancies.push(mapped);
      } catch (error) {
        this.logger.warn(`Skipping malformed JustRemote job: ${String(error)}`);
      }
    }
    this.logger.log(`JustRemote: parsed ${vacancies.length} jobs`);
    return vacancies;
  }

  private extractJobs(html: string): JrJob[] {
    const marker = html.indexOf(STATE_MARKER);
    if (marker === -1) {
      this.logger.warn('JustRemote: __PRELOADED_STATE__ not found');
      return [];
    }
    const braceStart = html.indexOf('{', marker);
    if (braceStart === -1) return [];
    const json = sliceBalancedObject(html, braceStart);
    if (!json) return [];
    const state = JSON.parse(json) as JrState;
    return (
      state.jobsState?.entity?.all ?? state.homeJobsState?.entity?.jobs ?? []
    );
  }

  private mapJob(job: JrJob): RawVacancy | null {
    if (job.is_active === false) return null;
    const title = (job.title ?? '').trim();
    if (!title) return null;

    const url = job.href
      ? job.href.startsWith('http')
        ? job.href
        : `${BASE_URL}${job.href.replace(/^\//, '')}`
      : undefined;
    const locations = Array.isArray(job.location_restrictions)
      ? job.location_restrictions.join(', ')
      : '';

    return {
      source: this.name,
      externalId: job.id !== undefined ? String(job.id) : undefined,
      url,
      title,
      company: job.company_name || undefined,
      rawText: [
        title,
        job.company_name,
        job.category,
        job.remote_type,
        locations,
        job.job_country ?? undefined,
      ]
        .filter(Boolean)
        .join('\n\n'),
      remote: this.mapRemote(job),
    };
  }

  private mapRemote(job: JrJob): RemoteMode {
    const hay =
      `${job.remote_type ?? ''} ${job.job_country ?? ''} ${(job.location_restrictions ?? []).join(' ')}`.toLowerCase();
    if (EU_HINT.test(hay)) return 'remote-eu';
    return 'remote-global';
  }
}
