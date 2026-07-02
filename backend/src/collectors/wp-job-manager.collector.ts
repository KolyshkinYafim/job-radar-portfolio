import { XMLParser } from 'fast-xml-parser';
import type { RawVacancy, RemoteMode } from '../common/types';
import { BaseHttpCollector } from './base-http.collector';
import { stripHtml } from './html';

const ONSITE_HINT = /on-?site|in-?office|in-?person/i;
const EU_HINT =
  /\beurope\b|\bemea\b|\beu\b|poland|polska|germany|deutschland|spain|portugal|netherlands|france|italy|ireland|sweden|united kingdom|\buk\b/i;
const REMOTE_HINT = /remote|anywhere|worldwide|distributed/i;

interface WpJobItem {
  title?: string;
  link?: string;
  guid?: string;
  pubDate?: string;
  description?: string;
  'content:encoded'?: string;
  'dc:creator'?: string;
  'job_listing:company'?: string;
  'job_listing:location'?: string;
  'job_listing:job_type'?: string;
  'job_listing:job_category'?: string;
}

interface WpFeed {
  rss?: { channel?: { item?: WpJobItem | WpJobItem[] } };
}

export abstract class WpJobManagerCollector extends BaseHttpCollector {
  abstract readonly name: string;
  protected abstract readonly feedUrl: string;
  protected readonly defaultRemote: RemoteMode = 'remote-global';

  private readonly parser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false,
  });

  async collect(): Promise<RawVacancy[]> {
    const xml = await this.fetchText(this.feedUrl, {
      Accept: 'application/rss+xml, application/xml, text/xml',
    });
    if (xml === null) {
      return [];
    }

    let items: WpJobItem[];
    try {
      const feed = this.parser.parse(xml) as WpFeed;
      const raw = feed.rss?.channel?.item ?? [];
      items = Array.isArray(raw) ? raw : [raw];
    } catch (error) {
      this.logger.warn(`${this.name} collection failed: ${String(error)}`);
      return [];
    }

    const vacancies: RawVacancy[] = [];
    for (const item of items) {
      try {
        const mapped = this.mapItem(item);
        if (mapped) vacancies.push(mapped);
      } catch (error) {
        this.logger.warn(
          `Skipping malformed ${this.name} item: ${String(error)}`,
        );
      }
    }
    return vacancies;
  }

  private mapItem(item: WpJobItem): RawVacancy | null {
    const title = stripHtml(item.title ?? '');
    if (!title) return null;

    const company =
      (item['job_listing:company'] ?? '').trim() ||
      this.creatorCompany(item['dc:creator']);
    const location = (item['job_listing:location'] ?? '').trim();
    const category = (item['job_listing:job_category'] ?? '').trim();
    const jobType = (item['job_listing:job_type'] ?? '').trim();
    const body = stripHtml(item['content:encoded'] ?? item.description ?? '');
    const postedAt = item.pubDate ? new Date(item.pubDate) : undefined;

    return {
      source: this.name,
      externalId: item.guid ?? item.link,
      url: item.link,
      title,
      company: company || undefined,
      rawText:
        [title, company, location, category, body]
          .filter(Boolean)
          .join('\n\n') || title,
      remote: this.mapRemote(location, jobType),
      postedAt:
        postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : undefined,
    };
  }

  private creatorCompany(creator?: string): string {
    if (!creator) return '';
    return stripHtml(creator).split(/[•⚲|]/)[0].trim();
  }

  private mapRemote(location: string, jobType: string): RemoteMode {
    const hay = `${location} ${jobType}`.toLowerCase();
    if (ONSITE_HINT.test(hay)) return 'onsite';
    if (EU_HINT.test(hay)) return 'remote-eu';
    if (REMOTE_HINT.test(hay)) return this.defaultRemote;
    return this.defaultRemote;
  }
}
