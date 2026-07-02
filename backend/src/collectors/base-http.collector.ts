import { Logger } from '@nestjs/common';
import type { RawVacancy } from '../common/types';
import type { JobCollector } from './collector.interface';

export const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const DEFAULT_TIMEOUT_MS = 15_000;

export abstract class BaseHttpCollector implements JobCollector {
  abstract readonly name: string;

  protected readonly logger = new Logger(this.constructor.name);
  protected readonly timeoutMs: number = DEFAULT_TIMEOUT_MS;

  abstract collect(): Promise<RawVacancy[]>;

  protected headers(extra?: Record<string, string>): Record<string, string> {
    return { 'User-Agent': DESKTOP_UA, ...extra };
  }

  protected async fetchJson<T>(
    url: string,
    extraHeaders?: Record<string, string>,
  ): Promise<T | null> {
    const res = await this.request(url, {
      Accept: 'application/json',
      ...extraHeaders,
    });
    if (!res) {
      return null;
    }
    try {
      return (await res.json()) as T;
    } catch (err) {
      this.logger.debug(
        `${this.name}: invalid JSON from ${url}: ${String(err)}`,
      );
      return null;
    }
  }

  protected async fetchText(
    url: string,
    extraHeaders?: Record<string, string>,
  ): Promise<string | null> {
    const res = await this.request(url, extraHeaders);
    if (!res) {
      return null;
    }
    try {
      return await res.text();
    } catch (err) {
      this.logger.debug(
        `${this.name}: unreadable body from ${url}: ${String(err)}`,
      );
      return null;
    }
  }

  protected async postJson<T>(
    url: string,
    body: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T | null> {
    const res = await this.request(
      url,
      {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...extraHeaders,
      },
      { method: 'POST', body: JSON.stringify(body) },
    );
    if (!res) {
      return null;
    }
    try {
      return (await res.json()) as T;
    } catch (err) {
      this.logger.debug(
        `${this.name}: invalid JSON from ${url}: ${String(err)}`,
      );
      return null;
    }
  }

  private async request(
    url: string,
    extraHeaders?: Record<string, string>,
    init?: { method?: string; body?: string },
  ): Promise<Response | null> {
    try {
      const res = await fetch(url, {
        method: init?.method,
        body: init?.body,
        headers: this.headers(extraHeaders),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) {
        this.logger.debug(`${this.name}: HTTP ${res.status} from ${url}`);
        return null;
      }
      return res;
    } catch (err) {
      this.logger.debug(
        `${this.name}: request to ${url} failed: ${String(err)}`,
      );
      return null;
    }
  }
}
