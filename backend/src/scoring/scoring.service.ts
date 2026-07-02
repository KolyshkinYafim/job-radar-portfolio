import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CandidateProfile, ScoreResult } from '../common/types';
import { LlmCallLogger } from './llm-call-logger.service';
import { isRemoteBaseUrl, resolveLlmRouting } from './llm-routing.helper';
import { buildScoringRequestBody } from './scoring-prompt';

interface ScoringInput {
  title?: string;
  company?: string;
  rawText: string;
}

interface ScoringContext {
  userId?: string;
  taskType?: string;
}

interface ModelsResponse {
  data?: { id?: string }[];
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

const HEALTH_TIMEOUT_MS = 3_000;
const COMPLETION_TIMEOUT_MS = 120_000;
const DEALBREAKER_SCORE_CAP = 40;

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);
  private readonly apiKey: string;
  private readonly thinking: boolean;
  private readonly discoveredModelByBaseUrl = new Map<string, string>();

  constructor(
    private readonly configService: ConfigService,
    private readonly llmCallLogger: LlmCallLogger,
  ) {
    this.apiKey = this.configService.get<string>('llm.apiKey') ?? '';
    this.thinking = this.configService.get<boolean>('llm.thinking') ?? true;

    const { baseUrl } = resolveLlmRouting(this.configService, 'score');
    if (!this.apiKey && isRemoteBaseUrl(baseUrl)) {
      this.logger.warn(
        `LLM_API_KEY is empty but the scoring endpoint "${baseUrl}" is remote — ` +
          `requests go out unauthenticated and will likely 401. Set LLM_API_KEY.`,
      );
    }
  }

  async isHealthy(): Promise<boolean> {
    const { baseUrl } = resolveLlmRouting(this.configService, 'score');
    try {
      const res = await fetch(`${baseUrl}/models`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async scoreVacancy(
    input: ScoringInput,
    profile: CandidateProfile,
    ctx?: ScoringContext,
  ): Promise<ScoreResult> {
    const taskType = ctx?.taskType ?? 'score';
    const { model, baseUrl } = await this.resolveRouting();
    const vacancyText = [input.title, input.company, input.rawText]
      .filter(Boolean)
      .join('\n\n');

    const body = buildScoringRequestBody({
      model,
      profile,
      vacancyText,
      thinking: this.thinking,
    });

    const startedAt = Date.now();
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(COMPLETION_TIMEOUT_MS),
      });

      if (!res.ok) {
        throw new Error(`LLM completion failed with status ${res.status}`);
      }

      const data = (await res.json()) as ChatCompletionResponse;
      const latencyMs = Date.now() - startedAt;
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.length === 0) {
        throw new Error('LLM completion returned no content');
      }

      const result = this.toScoreResult(JSON.parse(content), model, latencyMs);
      await this.llmCallLogger.log({
        userId: ctx?.userId,
        taskType,
        model,
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        latencyMs,
        ok: true,
      });
      this.logger.log(
        `Scored vacancy "${input.title ?? 'untitled'}" -> ${result.score} in ${latencyMs}ms`,
      );
      return result;
    } catch (err) {
      await this.llmCallLogger.log({
        userId: ctx?.userId,
        taskType,
        model,
        promptTokens: 0,
        completionTokens: 0,
        latencyMs: Date.now() - startedAt,
        ok: false,
      });
      throw err;
    }
  }

  private async resolveRouting(): Promise<{ model: string; baseUrl: string }> {
    const { model: configured, baseUrl } = resolveLlmRouting(
      this.configService,
      'score',
    );
    if (configured) {
      return { model: configured, baseUrl };
    }

    const cached = this.discoveredModelByBaseUrl.get(baseUrl);
    if (cached) {
      return { model: cached, baseUrl };
    }

    const res = await fetch(`${baseUrl}/models`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`LLM models endpoint failed with status ${res.status}`);
    }

    const data = (await res.json()) as ModelsResponse;
    const id = data.data?.[0]?.id;
    if (!id) {
      throw new Error('LLM reported no available models');
    }

    this.discoveredModelByBaseUrl.set(baseUrl, id);
    return { model: id, baseUrl };
  }

  private toScoreResult(
    parsed: unknown,
    model: string,
    latencyMs: number,
  ): ScoreResult {
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('LLM returned a non-object score payload');
    }
    const payload = parsed as Record<string, unknown>;
    if (typeof payload.score !== 'number' || Number.isNaN(payload.score)) {
      throw new Error('LLM score is not a number');
    }

    let score = Math.min(100, Math.max(0, Math.round(payload.score)));
    const redFlags = this.toStringArray(payload.redFlags);

    if (payload.dealbreaker === true) {
      score = Math.min(score, DEALBREAKER_SCORE_CAP);
      const reason =
        typeof payload.dealbreakerReason === 'string'
          ? payload.dealbreakerReason
          : '';
      if (reason && !redFlags.includes(reason)) {
        redFlags.unshift(reason);
      }
    }

    return {
      score,
      location: typeof payload.location === 'string' ? payload.location : '',
      reasonsPro: this.toStringArray(payload.reasonsPro),
      reasonsCon: this.toStringArray(payload.reasonsCon),
      stackMatch: this.toStringArray(payload.stackMatch),
      redFlags,
      model,
      latencyMs,
    };
  }

  private headers(base: Record<string, string> = {}): Record<string, string> {
    return this.apiKey
      ? { ...base, Authorization: `Bearer ${this.apiKey}` }
      : base;
  }

  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((item): item is string => typeof item === 'string');
  }
}
