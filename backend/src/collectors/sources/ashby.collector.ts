import { Injectable } from '@nestjs/common';
import type { RawVacancy, RemoteMode } from '../../common/types';
import { BaseHttpCollector } from '../base-http.collector';

const API_BASE = 'https://api.ashbyhq.com/posting-api/job-board';

const COMPANIES = ['fernbank-labs', 'solace-ai'];

const EU_HINT =
  /\beurope\b|\bemea\b|\beu\b|poland|germany|spain|portugal|netherlands|france|italy|ireland|sweden|united kingdom|\buk\b/i;

interface AshbyJob {
  id?: string;
  title?: string;
  department?: string;
  team?: string;
  employmentType?: string;
  location?: string;
  isRemote?: boolean;
  isListed?: boolean;
  workplaceType?: string;
  jobUrl?: string;
  applyUrl?: string;
  descriptionPlain?: string;
  publishedAt?: string;
  address?: { postalAddress?: { addressCountry?: string } };
}
interface AshbyResponse {
  jobs?: AshbyJob[];
}

function mapRemote(job: AshbyJob): RemoteMode {
  const workplace = (job.workplaceType ?? '').toLowerCase();
  const hay =
    `${job.location ?? ''} ${job.address?.postalAddress?.addressCountry ?? ''}`.toLowerCase();
  if (
    job.isRemote === false ||
    workplace.includes('onsite') ||
    workplace.includes('on-site')
  )
    return 'onsite';
  if (workplace.includes('hybrid')) return 'hybrid';
  if (EU_HINT.test(hay)) return 'remote-eu';
  return 'remote-global';
}

@Injectable()
export class AshbyCollector extends BaseHttpCollector {
  readonly name = 'ashby';

  async collect(): Promise<RawVacancy[]> {
    const all: RawVacancy[] = [];

    await Promise.allSettled(
      COMPANIES.map(async (company) => {
        const data = await this.fetchJson<AshbyResponse>(
          `${API_BASE}/${company}`,
        );
        if (!data) return;

        const jobs = data.jobs ?? [];
        this.logger.debug(`Ashby [${company}]: ${jobs.length} jobs`);

        for (const job of jobs) {
          if (job.isListed === false) continue;
          const title = (job.title ?? '').trim();
          if (!title) continue;
          const postedAt = job.publishedAt
            ? new Date(job.publishedAt)
            : undefined;
          all.push({
            source: `ashby/${company}`,
            externalId: job.id,
            url: job.jobUrl ?? job.applyUrl,
            title,
            company: company.charAt(0).toUpperCase() + company.slice(1),
            rawText: [
              title,
              company,
              job.location,
              job.department,
              job.descriptionPlain,
            ]
              .filter(Boolean)
              .join('\n\n'),
            stack: [],
            remote: mapRemote(job),
            postedAt:
              postedAt && !Number.isNaN(postedAt.getTime())
                ? postedAt
                : undefined,
          });
        }
      }),
    );

    this.logger.log(
      `Ashby: collected ${all.length} jobs from ${COMPANIES.length} companies`,
    );
    return all;
  }
}
