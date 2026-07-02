import { Injectable } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import { RawVacancy, RemoteMode } from '../../common/types';
import { BaseHttpCollector } from '../base-http.collector';
import { stripHtml } from '../html';

const FEED_URL =
  'https://weworkremotely.com/categories/remote-programming-jobs.rss';

const EU_REGION_HINT = /europe/i;
const TITLE_SEPARATOR = ': ';

interface WwrItem {
  title?: string;
  region?: string;
  category?: string;
  description?: string;
  pubDate?: string;
  guid?: string;
  link?: string;
}

interface WwrFeed {
  rss?: {
    channel?: {
      item?: WwrItem | WwrItem[];
    };
  };
}

@Injectable()
export class WeWorkRemotelyCollector extends BaseHttpCollector {
  readonly name = 'wwr';

  private readonly parser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false,
  });

  async collect(): Promise<RawVacancy[]> {
    const xml = await this.fetchText(FEED_URL, {
      Accept: 'application/rss+xml, application/xml, text/xml',
    });
    if (xml === null) {
      return [];
    }

    let items: WwrItem[];
    try {
      const feed = this.parser.parse(xml) as WwrFeed;
      const rawItems = feed.rss?.channel?.item ?? [];
      items = Array.isArray(rawItems) ? rawItems : [rawItems];
    } catch (error) {
      this.logger.warn(`WeWorkRemotely parse failed: ${String(error)}`);
      return [];
    }

    const vacancies: RawVacancy[] = [];
    for (const item of items) {
      try {
        vacancies.push(this.mapItem(item));
      } catch (error) {
        this.logger.warn(
          `Skipping malformed WWR item ${item?.guid ?? '<unknown>'}: ${String(error)}`,
        );
      }
    }
    return vacancies;
  }

  private mapItem(item: WwrItem): RawVacancy {
    const fullTitle = (item.title ?? '').trim();
    if (!fullTitle) {
      throw new Error('item is missing title');
    }
    const { company, title } = this.splitTitle(fullTitle);
    const remote: RemoteMode = EU_REGION_HINT.test(item.region ?? '')
      ? 'remote-eu'
      : 'remote-global';
    const rawText = stripHtml(item.description ?? '');
    const postedAt = item.pubDate ? new Date(item.pubDate) : undefined;

    return {
      source: this.name,
      externalId: item.guid,
      url: item.link,
      title,
      company,
      rawText: rawText || fullTitle,
      remote,
      postedAt:
        postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : undefined,
    };
  }

  private splitTitle(fullTitle: string): {
    company: string | undefined;
    title: string;
  } {
    const separatorIndex = fullTitle.indexOf(TITLE_SEPARATOR);
    if (separatorIndex <= 0) {
      return { company: undefined, title: fullTitle };
    }
    return {
      company: fullTitle.slice(0, separatorIndex).trim(),
      title: fullTitle.slice(separatorIndex + TITLE_SEPARATOR.length).trim(),
    };
  }
}
