import { Injectable } from '@nestjs/common';
import type { RawVacancy, RemoteMode } from '../../common/types';
import { BaseHttpCollector } from '../base-http.collector';
import { stripHtml } from '../html';

const API_BASE = 'https://boards-api.greenhouse.io/v1/boards';

const COMPANIES = ['acme-analytics', 'northwind-cloud', 'ridgeline-data'];

interface GreenhouseLocation {
  name?: string;
}

interface GreenhouseDepartment {
  name?: string;
}

interface GreenhouseJob {
  id?: number;
  title?: string;
  updated_at?: string;
  absolute_url?: string;
  location?: GreenhouseLocation;
  departments?: GreenhouseDepartment[];
  content?: string;
}

interface GreenhouseResponse {
  jobs?: GreenhouseJob[];
}

function mapRemote(location: string | undefined): RemoteMode {
  if (!location) return 'remote-global';
  const l = location.toLowerCase();
  if (l.includes('onsite') || l.includes('on-site') || l.includes('in-office'))
    return 'onsite';
  if (l.includes('remote') || l.includes('anywhere')) {
    if (
      l.includes('europe') ||
      l.includes(' eu') ||
      l.includes('emea') ||
      l.includes('poland') ||
      l.includes('germany') ||
      l.includes('uk')
    )
      return 'remote-eu';
    return 'remote-global';
  }
  return 'remote-global';
}

@Injectable()
export class GreenhouseCollector extends BaseHttpCollector {
  readonly name = 'greenhouse';

  async collect(): Promise<RawVacancy[]> {
    const all: RawVacancy[] = [];

    await Promise.allSettled(
      COMPANIES.map(async (company) => {
        const data = await this.fetchJson<GreenhouseResponse>(
          `${API_BASE}/${company}/jobs?content=true`,
        );
        const jobs = data?.jobs ?? [];

        for (const job of jobs) {
          try {
            const description = stripHtml(job.content ?? '');
            all.push({
              source: `greenhouse/${company}`,
              externalId: job.id?.toString(),
              url: job.absolute_url,
              title: job.title,
              company: company.charAt(0).toUpperCase() + company.slice(1),
              rawText: [job.title, company, job.location?.name, description]
                .filter(Boolean)
                .join('\n\n'),
              stack: [],
              remote: mapRemote(job.location?.name),
              postedAt: job.updated_at ? new Date(job.updated_at) : undefined,
            });
          } catch (error) {
            this.logger.warn(
              `Skipping malformed ${company} job ${job.id ?? '<unknown>'}: ${String(error)}`,
            );
          }
        }
      }),
    );

    this.logger.log(
      `Greenhouse: collected ${all.length} jobs from ${COMPANIES.length} companies`,
    );
    return all;
  }
}
