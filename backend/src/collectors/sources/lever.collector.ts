import { Injectable } from '@nestjs/common';
import type { RawVacancy, RemoteMode } from '../../common/types';
import { BaseHttpCollector } from '../base-http.collector';

const API_BASE = 'https://api.lever.co/v0/postings';

const COMPANIES = ['vertex-robotics', 'bluepeak-systems', 'ironwood-digital'];

interface LeverCategories {
  team?: string;
  commitment?: string;
  location?: string;
  department?: string;
}

interface LeverPosting {
  id?: string;
  text?: string;
  categories?: LeverCategories;
  description?: string;
  descriptionPlain?: string;
  additional?: string;
  additionalPlain?: string;
  hostedUrl?: string;
  applyUrl?: string;
  createdAt?: number;
}

function mapRemote(
  location: string | undefined,
  commitment: string | undefined,
): RemoteMode {
  const loc = (location ?? '').toLowerCase();
  const com = (commitment ?? '').toLowerCase();
  const combined = `${loc} ${com}`;
  if (
    combined.includes('onsite') ||
    combined.includes('on-site') ||
    combined.includes('in-person')
  )
    return 'onsite';
  if (combined.includes('remote') || combined.includes('anywhere')) {
    if (
      combined.includes('europe') ||
      combined.includes(' eu ') ||
      combined.includes('emea') ||
      combined.includes('poland') ||
      combined.includes('germany')
    )
      return 'remote-eu';
    return 'remote-global';
  }
  return 'remote-global';
}

@Injectable()
export class LeverCollector extends BaseHttpCollector {
  readonly name = 'lever';

  async collect(): Promise<RawVacancy[]> {
    const all: RawVacancy[] = [];

    await Promise.allSettled(
      COMPANIES.map(async (company) => {
        const postings = await this.fetchJson<LeverPosting[]>(
          `${API_BASE}/${company}?mode=json`,
        );
        if (!Array.isArray(postings)) return;

        this.logger.debug(`Lever [${company}]: ${postings.length} postings`);

        for (const p of postings) {
          all.push({
            source: `lever/${company}`,
            externalId: p.id,
            url: p.hostedUrl,
            title: p.text,
            company: company.charAt(0).toUpperCase() + company.slice(1),
            rawText: [
              p.text,
              company,
              p.categories?.location,
              p.descriptionPlain ?? p.description?.replace(/<[^>]+>/g, ' '),
              p.additionalPlain ?? p.additional?.replace(/<[^>]+>/g, ' '),
            ]
              .filter(Boolean)
              .join('\n\n'),
            stack: [],
            remote: mapRemote(p.categories?.location, p.categories?.commitment),
            postedAt: p.createdAt ? new Date(p.createdAt) : undefined,
          });
        }
      }),
    );

    this.logger.log(
      `Lever: collected ${all.length} postings from ${COMPANIES.length} companies`,
    );
    return all;
  }
}
