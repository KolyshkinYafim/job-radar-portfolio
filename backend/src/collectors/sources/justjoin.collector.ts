import { Injectable } from '@nestjs/common';
import { RawVacancy, RemoteMode, Seniority } from '../../common/types';
import { BaseHttpCollector } from '../base-http.collector';

const API_URL = 'https://api.justjoin.it/v2/user-panel/offers/by-cursor';
const OFFER_BASE_URL = 'https://justjoin.it/job-offer';
const JAVASCRIPT_CATEGORY_ID = 1;
const PAGE_SIZE = 20;
const MAX_PAGES = 2;

interface JustJoinEmploymentType {
  from: number | null;
  to: number | null;
  currency: string | null;
  type: string;
  unit?: string;
}

interface JustJoinOffer {
  guid?: string;
  slug: string;
  title: string;
  requiredSkills: string[] | null;
  niceToHaveSkills?: string[] | null;
  workplaceType?: string;
  experienceLevel?: string;
  employmentTypes?: JustJoinEmploymentType[] | null;
  city?: string | null;
  companyName?: string;
  publishedAt?: string;
}

interface JustJoinOffersResponse {
  data?: JustJoinOffer[];
}

const REMOTE_MODES: Record<string, RemoteMode> = {
  remote: 'remote-eu',
  hybrid: 'hybrid',
  office: 'onsite',
};

const SENIORITIES: Record<string, Seniority> = {
  junior: 'junior',
  mid: 'mid',
  senior: 'senior',
  manager: 'lead',
  c_level: 'lead',
};

@Injectable()
export class JustJoinCollector extends BaseHttpCollector {
  readonly name = 'justjoin';

  async collect(): Promise<RawVacancy[]> {
    const vacancies: RawVacancy[] = [];
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const offers = await this.fetchPage(page * PAGE_SIZE);
        for (const offer of offers) {
          try {
            vacancies.push(this.mapOffer(offer));
          } catch (error) {
            this.logger.warn(
              `Skipping malformed offer ${offer?.slug ?? '<unknown>'}: ${String(error)}`,
            );
          }
        }
        if (offers.length < PAGE_SIZE) {
          break;
        }
      }
    } catch (error) {
      this.logger.warn(`justjoin.it collection failed: ${String(error)}`);
      return [];
    }
    return vacancies;
  }

  private async fetchPage(from: number): Promise<JustJoinOffer[]> {
    const url = `${API_URL}?categories[]=${JAVASCRIPT_CATEGORY_ID}&sortBy=published&orderBy=DESC&from=${from}`;
    const body = await this.fetchJson<JustJoinOffersResponse>(url);
    return body && Array.isArray(body.data) ? body.data : [];
  }

  private mapOffer(offer: JustJoinOffer): RawVacancy {
    if (!offer.slug || !offer.title) {
      throw new Error('offer is missing slug or title');
    }
    const salary = this.pickSalary(offer.employmentTypes ?? []);
    const stack = offer.requiredSkills ?? undefined;
    const remote = REMOTE_MODES[offer.workplaceType ?? ''] ?? 'unknown';
    const postedAt = this.parseDate(offer.publishedAt);

    return {
      source: this.name,
      externalId: offer.slug,
      url: `${OFFER_BASE_URL}/${offer.slug}`,
      title: offer.title.trim(),
      company: offer.companyName,
      rawText: this.composeRawText(offer, salary),
      salaryMin: salary?.from ?? undefined,
      salaryMax: salary?.to ?? undefined,
      currency: salary?.currency?.toUpperCase(),
      stack,
      remote,
      seniority: SENIORITIES[offer.experienceLevel ?? ''] ?? 'unknown',
      postedAt,
    };
  }

  private pickSalary(
    employmentTypes: JustJoinEmploymentType[],
  ): JustJoinEmploymentType | undefined {
    return employmentTypes.find(
      (et) => (et.from !== null || et.to !== null) && Boolean(et.currency),
    );
  }

  private composeRawText(
    offer: JustJoinOffer,
    salary: JustJoinEmploymentType | undefined,
  ): string {
    const lines = [
      `${offer.title.trim()} at ${offer.companyName ?? 'unknown company'}`,
    ];
    if (offer.requiredSkills?.length) {
      lines.push(`Skills: ${offer.requiredSkills.join(', ')}`);
    }
    if (offer.workplaceType) {
      const city = offer.city ? ` (${offer.city})` : '';
      lines.push(`Workplace: ${offer.workplaceType}${city}`);
    }
    if (offer.experienceLevel) {
      lines.push(`Experience: ${offer.experienceLevel}`);
    }
    if (salary) {
      const range = [salary.from, salary.to]
        .filter((v) => v !== null)
        .join('-');
      const unit = salary.unit ? `/${salary.unit}` : '';
      lines.push(
        `Salary: ${range} ${salary.currency?.toUpperCase()}${unit} (${salary.type})`,
      );
    }
    return lines.join('\n');
  }

  private parseDate(value: string | undefined): Date | undefined {
    if (!value) {
      return undefined;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
}
