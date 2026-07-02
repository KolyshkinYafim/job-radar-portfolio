import { Injectable } from '@nestjs/common';
import type { RawVacancy, RemoteMode } from '../../common/types';
import { BaseHttpCollector } from '../base-http.collector';
import { stripHtml } from '../html';

const SEARCH_URL =
  'https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=12';
const itemUrl = (id: string): string =>
  `https://hn.algolia.com/api/v1/items/${id}`;

const THREAD_TITLE_RE = /who is hiring/i;
const REMOTE_HINT = /\bremote\b|\banywhere\b|worldwide/i;
const EU_HINT =
  /\beurope\b|\bemea\b|\beu\b|poland|germany|spain|portugal|netherlands|france|italy|ireland|sweden|united kingdom|\buk\b/i;

interface HnStory {
  objectID: string;
  title?: string;
}
interface HnSearch {
  hits?: HnStory[];
}
interface HnComment {
  id?: number;
  author?: string;
  text?: string | null;
  created_at?: string;
  children?: HnComment[];
}

@Injectable()
export class HackerNewsCollector extends BaseHttpCollector {
  readonly name = 'hackernews';

  async collect(): Promise<RawVacancy[]> {
    try {
      const threadId = await this.findLatestThread();
      if (!threadId) {
        this.logger.warn('HackerNews: no "Who is hiring" thread found');
        return [];
      }
      const thread = await this.fetchJson<HnComment>(itemUrl(threadId));
      if (!thread) {
        return [];
      }
      const posts = thread.children ?? [];

      const vacancies: RawVacancy[] = [];
      for (const post of posts) {
        try {
          const mapped = this.mapComment(post);
          if (mapped) vacancies.push(mapped);
        } catch (error) {
          this.logger.warn(
            `Skipping malformed HN comment ${post.id ?? '<unknown>'}: ${String(error)}`,
          );
        }
      }
      this.logger.log(
        `HackerNews: parsed ${vacancies.length} posts from thread ${threadId}`,
      );
      return vacancies;
    } catch (error) {
      this.logger.warn(`HackerNews collection failed: ${String(error)}`);
      return [];
    }
  }

  private async findLatestThread(): Promise<string | null> {
    const data = await this.fetchJson<HnSearch>(SEARCH_URL);
    const hit = (data?.hits ?? []).find((h) =>
      THREAD_TITLE_RE.test(h.title ?? ''),
    );
    return hit?.objectID ?? null;
  }

  private mapComment(comment: HnComment): RawVacancy | null {
    const text = stripHtml(comment.text ?? '');
    if (!text || text.length < 20) return null;

    const firstSegment = text.split(/[|\n]/)[0].trim();
    const company =
      firstSegment.length >= 2 &&
      firstSegment.length <= 60 &&
      !/https?:/i.test(firstSegment)
        ? firstSegment
        : undefined;
    const postedAt = comment.created_at
      ? new Date(comment.created_at)
      : undefined;

    return {
      source: this.name,
      externalId: comment.id !== undefined ? String(comment.id) : undefined,
      url: this.firstUrl(comment.text ?? ''),
      company,
      rawText: text,
      remote: this.mapRemote(text),
      postedAt:
        postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : undefined,
    };
  }

  private firstUrl(htmlText: string): string | undefined {
    const match = htmlText.match(/href="([^"]+)"/);
    if (!match) return undefined;
    return match[1].replace(/&#x2F;/g, '/').replace(/&amp;/g, '&');
  }

  private mapRemote(text: string): RemoteMode {
    if (!REMOTE_HINT.test(text)) return 'onsite';
    if (EU_HINT.test(text)) return 'remote-eu';
    return 'remote-global';
  }
}
