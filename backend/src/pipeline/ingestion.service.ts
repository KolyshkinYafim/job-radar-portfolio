import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import type {
  HardFilterResult,
  IngestOutcome,
  Ingestor,
  NormalizedVacancy,
  RawVacancy,
  RemoteMode,
  Seniority,
} from '../common/types';
import { VacancyStatus } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringQueueService } from '../queue/scoring-queue.service';

const JUNIOR_PATTERN = /\b(junior|jr\.?|entry.?level|0-?[12]\s*yr)/i;
const SENIORITY_PATTERN = /\b(senior|sr\.?|lead|principal|staff)\b/i;
const MID_PATTERN = /\b(mid(?:dle)?|regular)\b/i;

const REMOTE_EU_PATTERN = /remote.{0,20}(eu|europe|european)/i;
const REMOTE_GLOBAL_PATTERN = /\bremote\b/i;
const HYBRID_PATTERN = /\b(hybrid|flexi)\b/i;
const ONSITE_PATTERN = /\b(on.?site|in.?office|in.?person|office.?based)\b/i;

const AMSTERDAM_PATTERN = /\b(amsterdam|ams)\b/i;

const EARLY_CAREER_PATTERN =
  /\b(intern|internship|trainee|graduate|apprentice|working student|werkstudent|praktyk|стаж|стажиров)\b/i;

const NEGATIVE_ROLE_PATTERN =
  /(\bsales\b|\baccount executive\b|\bbusiness development\b|\brecruiter\b|\btalent acquisition\b|\bcustomer success\b|\bcustomer support\b|\bsupport engineer\b|\bsolutions? engineer\b|\bpre.?sales\b|\bmarketing\b|\bcopywriter\b|\bcontent writer\b|\bproduct manager\b|\bproject manager\b|\bprogram manager\b|\bdesigner\b|\bux\b|\blawyer\b|\bcounsel\b|\baccountant\b|\bbookkeeper\b|\bpayroll\b|\bhuman resources\b|\bpeople partner\b|\boffice manager\b|\bcommunity manager\b|\bsocial media\b)/i;

const TECH_ROLE_PATTERN =
  /\b(developer|engineer|engineering|programmer|software|full.?stack|front.?end|back.?end|devops|sre|architect|разработчик|программист|инженер|programista|deweloper)\b/i;
const TECH_STACK_PATTERN =
  /\b(typescript|javascript|node(?:\.js)?|react|next\.?js|nest(?:js)?|vue|angular|svelte|golang|python|java|kotlin|php|ruby|rust|c#|\.net|scala|elixir|sql|postgres(?:ql)?|mysql|mongodb|redis|kafka|graphql|grpc|aws|gcp|azure|kubernetes|k8s|docker|terraform)\b/i;

export type HardFilterInput = Pick<
  NormalizedVacancy,
  'title' | 'rawText' | 'stack' | 'seniority' | 'remote'
>;

function normalizeKeyPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function computeHash(
  raw: Pick<
    RawVacancy,
    'source' | 'externalId' | 'title' | 'company' | 'rawText'
  >,
): string {
  const company = raw.company ? normalizeKeyPart(raw.company) : '';
  const title = raw.title ? normalizeKeyPart(raw.title) : '';

  const key =
    company && title
      ? `co:${company}:${title}`
      : `src:${raw.source}:${raw.externalId ?? raw.rawText.toLowerCase().replace(/\s+/g, ' ').trim()}`;
  return createHash('sha256').update(key).digest('hex');
}

function extractSeniority(title: string, text: string): Seniority {
  const combined = `${title} ${text}`;
  if (SENIORITY_PATTERN.test(combined)) return 'senior';
  if (JUNIOR_PATTERN.test(combined)) return 'junior';
  if (MID_PATTERN.test(combined)) return 'mid';
  return 'unknown';
}

function extractRemote(text: string): RemoteMode {
  if (REMOTE_EU_PATTERN.test(text)) return 'remote-eu';
  if (ONSITE_PATTERN.test(text)) return 'onsite';
  if (HYBRID_PATTERN.test(text)) return 'hybrid';
  if (REMOTE_GLOBAL_PATTERN.test(text)) return 'remote-global';
  return 'unknown';
}

function normalize(raw: RawVacancy): NormalizedVacancy {
  const combined = `${raw.title ?? ''} ${raw.rawText}`;
  return {
    source: raw.source,
    externalId: raw.externalId ?? null,
    url: raw.url ?? null,
    title: raw.title ?? raw.rawText.split('\n')[0].slice(0, 120),
    company: raw.company ?? null,
    rawText: raw.rawText,
    stack: raw.stack ?? [],
    salaryMin: raw.salaryMin ?? null,
    salaryMax: raw.salaryMax ?? null,
    currency: raw.currency ?? null,
    remote: raw.remote ?? extractRemote(combined),
    seniority: raw.seniority ?? extractSeniority(raw.title ?? '', raw.rawText),
    dedupHash: computeHash(raw),
    postedAt: raw.postedAt ?? null,
  };
}

export function hardFilter(v: HardFilterInput): HardFilterResult {
  const reasons: string[] = [];
  const combined = `${v.title} ${v.rawText}`;

  if (v.seniority === 'junior' || EARLY_CAREER_PATTERN.test(v.title)) {
    reasons.push('junior position');
  }

  if (v.remote === 'onsite' && !AMSTERDAM_PATTERN.test(v.rawText)) {
    reasons.push('onsite outside Amsterdam');
  }

  const titleIsTech = TECH_ROLE_PATTERN.test(v.title);
  if (
    NEGATIVE_ROLE_PATTERN.test(v.title) ||
    (!titleIsTech && NEGATIVE_ROLE_PATTERN.test(v.rawText))
  ) {
    reasons.push('non-engineering role');
  }

  const isTech =
    v.stack.length > 0 ||
    TECH_ROLE_PATTERN.test(combined) ||
    TECH_STACK_PATTERN.test(combined);
  if (!isTech) {
    reasons.push('no tech signal');
  }

  return { passed: reasons.length === 0, reasons };
}

@Injectable()
export class IngestionService implements Ingestor {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: ScoringQueueService,
  ) {}

  async ingest(raw: RawVacancy): Promise<IngestOutcome> {
    const normalized = normalize(raw);
    const { passed, reasons } = hardFilter(normalized);

    if (!passed) {
      this.logger.debug(
        `Filtered "${normalized.title}": ${reasons.join(', ')}`,
      );
      return { outcome: 'filtered_out', reasons };
    }

    try {
      const existing = await this.prisma.vacancy.findUnique({
        where: { dedupHash: normalized.dedupHash },
        select: { id: true },
      });

      if (existing) {
        return { outcome: 'duplicate', vacancyId: existing.id };
      }

      const vacancy = await this.prisma.vacancy.create({
        data: {
          source: normalized.source,
          externalId: normalized.externalId,
          url: normalized.url,
          title: normalized.title,
          company: normalized.company,
          rawText: normalized.rawText,
          stack: normalized.stack,
          salaryMin: normalized.salaryMin,
          salaryMax: normalized.salaryMax,
          currency: normalized.currency,
          remote: normalized.remote,
          seniority: normalized.seniority,
          dedupHash: normalized.dedupHash,
          postedAt: normalized.postedAt,
          status: VacancyStatus.Queued,
        },
        select: { id: true },
      });

      const jobIds = await this.queue.enqueueScoring(vacancy.id);
      if (jobIds.length === 0) {
        await this.prisma.vacancy.update({
          where: { id: vacancy.id },
          data: { status: VacancyStatus.New },
        });
        this.logger.warn(
          `Ingested "${normalized.title}" (${vacancy.id}) but enqueued nothing ` +
            `(no users) — left as "new" for the backlog reconciler`,
        );
      } else {
        this.logger.log(
          `Queued vacancy "${normalized.title}" (${vacancy.id}) for ${jobIds.length} user(s)`,
        );
      }
      return { outcome: 'queued', vacancyId: vacancy.id };
    } catch (error) {
      this.logger.error(
        `Ingest failed for "${normalized.title}": ${(error as Error).message}`,
      );
      return { outcome: 'error' };
    }
  }
}
