import { Injectable } from '@nestjs/common';
import type { RawVacancy, RemoteMode, Seniority } from '../../common/types';
import { BaseHttpCollector } from '../base-http.collector';
import { stripHtml } from '../html';

const PAGE_URL = 'https://www.remoterocketship.com/';
const NEXT_DATA_RE = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;
const EU_HINT =
  /\beurope\b|\bemea\b|\beu\b|poland|germany|spain|portugal|netherlands|france|italy|ireland|sweden|united kingdom|\buk\b/i;

interface RrCompany {
  name?: string;
}
interface RrSalary {
  min?: number;
  max?: number;
  currencyCode?: string;
}
interface RrJob {
  id?: number | string;
  slug?: string;
  roleTitle?: string;
  company?: RrCompany | string;
  url?: string;
  salaryRange?: RrSalary | null;
  techStack?: string[];
  location?: string;
  locationType?: string;
  jobDescriptionSummary?: string;
  twoLineJobDescriptionSummary?: string;
  isJunior?: boolean;
  isEntryLevel?: boolean;
  isMidLevel?: boolean;
  isSenior?: boolean;
  isLead?: boolean;
  created_at?: string;
}
interface RrNextData {
  props?: { pageProps?: { initialJobOpenings?: RrJob[] } };
}

@Injectable()
export class RemoteRocketshipCollector extends BaseHttpCollector {
  readonly name = 'remoterocketship';

  async collect(): Promise<RawVacancy[]> {
    const html = await this.fetchText(PAGE_URL, { Accept: 'text/html' });
    if (html === null) {
      return [];
    }

    let jobs: RrJob[];
    try {
      jobs = this.extractJobs(html);
    } catch (error) {
      this.logger.warn(`RemoteRocketship collection failed: ${String(error)}`);
      return [];
    }

    const vacancies: RawVacancy[] = [];
    for (const job of jobs) {
      try {
        const mapped = this.mapJob(job);
        if (mapped) vacancies.push(mapped);
      } catch (error) {
        this.logger.warn(
          `Skipping malformed RemoteRocketship job: ${String(error)}`,
        );
      }
    }
    this.logger.log(`RemoteRocketship: parsed ${vacancies.length} jobs`);
    return vacancies;
  }

  private extractJobs(html: string): RrJob[] {
    const match = html.match(NEXT_DATA_RE);
    if (!match) {
      this.logger.warn('RemoteRocketship: __NEXT_DATA__ not found');
      return [];
    }
    const data = JSON.parse(match[1]) as RrNextData;
    return data.props?.pageProps?.initialJobOpenings ?? [];
  }

  private mapJob(job: RrJob): RawVacancy | null {
    const title = (job.roleTitle ?? '').trim();
    if (!title) return null;

    const company =
      typeof job.company === 'string' ? job.company : job.company?.name;
    const stack = Array.isArray(job.techStack)
      ? job.techStack.map((t) => String(t))
      : [];
    const salaryMin =
      typeof job.salaryRange?.min === 'number' && job.salaryRange.min > 0
        ? job.salaryRange.min
        : undefined;
    const salaryMax =
      typeof job.salaryRange?.max === 'number' && job.salaryRange.max > 0
        ? job.salaryRange.max
        : undefined;
    const currency =
      salaryMin !== undefined || salaryMax !== undefined
        ? (job.salaryRange?.currencyCode ?? 'USD')
        : undefined;
    const summary =
      job.jobDescriptionSummary ?? job.twoLineJobDescriptionSummary ?? '';
    const postedAt = job.created_at ? new Date(job.created_at) : undefined;

    return {
      source: this.name,
      externalId:
        job.id !== undefined && job.id !== null ? String(job.id) : job.slug,
      url: job.url,
      title,
      company: company || undefined,
      rawText:
        [title, company, job.location, stripHtml(summary)]
          .filter(Boolean)
          .join('\n\n') || title,
      salaryMin,
      salaryMax,
      currency,
      stack,
      remote: this.mapRemote(job),
      seniority: this.mapSeniority(job),
      postedAt:
        postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : undefined,
    };
  }

  private mapRemote(job: RrJob): RemoteMode {
    const hay = `${job.location ?? ''} ${job.locationType ?? ''}`.toLowerCase();
    if (
      hay.includes('onsite') ||
      hay.includes('on-site') ||
      hay.includes('in-office') ||
      hay.includes('in person')
    )
      return 'onsite';
    if (EU_HINT.test(hay)) return 'remote-eu';
    return 'remote-global';
  }

  private mapSeniority(job: RrJob): Seniority {
    if (job.isLead) return 'lead';
    if (job.isSenior) return 'senior';
    if (job.isMidLevel) return 'mid';
    if (job.isJunior || job.isEntryLevel) return 'junior';
    return 'unknown';
  }
}
