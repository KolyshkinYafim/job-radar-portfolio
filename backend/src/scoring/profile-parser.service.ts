import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProfileDraft } from '../common/types';
import { LlmCallLogger } from './llm-call-logger.service';
import { resolveLlmRouting } from './llm-routing.helper';

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

const COMPLETION_TIMEOUT_MS = 120_000;

const SYSTEM_PROMPT = `Ты извлекаешь данные из CV разработчика для матчинга вакансий. Верни строгий JSON.

Правила:
- coreStack: технологии, на которых кандидат реально работает (языки, фреймворки, БД, инфра). Короткие канонические названия (например, "TypeScript", "NestJS", "PostgreSQL").
- strongPlus: сильные плюсы / экспертные ниши (например, "AI/LLM", "Distributed systems", "Kubernetes").
- redFlags: что кандидат явно НЕ хочет (стек, домены, форматы работы). Если в CV не указано — пустой массив.
- seniority: одно слово из {junior, mid, senior, lead, principal}; опусти если не ясно.
- locationPref: предпочтения по локации/режиму ("Remote EU", "Amsterdam hybrid", "Berlin"). Если в CV не указано — пустой массив.
- salaryMin / salaryTarget: годовая база в EUR, целые числа. Опусти если не указано.

Никаких комментариев, никаких пояснений — только JSON по схеме.`;

@Injectable()
export class ProfileParserService {
  private readonly logger = new Logger(ProfileParserService.name);
  private readonly apiKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly llmCallLogger: LlmCallLogger,
  ) {
    this.apiKey = this.configService.get<string>('llm.apiKey') ?? '';
  }

  async parseCv(cvText: string, userId?: string): Promise<ProfileDraft> {
    const { model, baseUrl } = this.resolveRouting();
    const startedAt = Date.now();

    const body = {
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: cvText },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'profile_draft',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              coreStack: { type: 'array', items: { type: 'string' } },
              strongPlus: { type: 'array', items: { type: 'string' } },
              redFlags: { type: 'array', items: { type: 'string' } },
              seniority: { type: 'string' },
              locationPref: { type: 'array', items: { type: 'string' } },
              salaryMin: { type: 'integer', minimum: 0 },
              salaryTarget: { type: 'integer', minimum: 0 },
            },
            required: ['coreStack', 'strongPlus', 'redFlags', 'locationPref'],
            additionalProperties: false,
          },
        },
      },
      temperature: 0.1,
      chat_template_kwargs: { enable_thinking: false },
    };

    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(COMPLETION_TIMEOUT_MS),
      });

      if (!res.ok) {
        throw new Error(`CV parse LLM call failed with status ${res.status}`);
      }

      const data = (await res.json()) as ChatCompletionResponse;
      const latencyMs = Date.now() - startedAt;
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.length === 0) {
        throw new Error('CV parse LLM returned no content');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch (err) {
        throw new Error(
          `CV parse LLM returned invalid JSON: ${(err as Error).message}`,
        );
      }

      const draft = this.toProfileDraft(parsed);
      await this.llmCallLogger.log({
        userId,
        taskType: 'cv-parse',
        model,
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        latencyMs,
        ok: true,
      });
      this.logger.log(
        `Parsed CV (${cvText.length} chars) with model ${model} in ${latencyMs}ms`,
      );
      return draft;
    } catch (err) {
      await this.llmCallLogger.log({
        userId,
        taskType: 'cv-parse',
        model,
        promptTokens: 0,
        completionTokens: 0,
        latencyMs: Date.now() - startedAt,
        ok: false,
      });
      throw err;
    }
  }

  private resolveRouting(): { model: string; baseUrl: string } {
    const { model, baseUrl } = resolveLlmRouting(
      this.configService,
      'cv-parse',
    );
    if (!model) {
      throw new Error(
        'No LLM model configured for CV parsing (set LLM_MODEL_PARSE or LLM_MODEL)',
      );
    }
    return { model, baseUrl };
  }

  private toProfileDraft(parsed: unknown): ProfileDraft {
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error('CV parse LLM returned a non-object payload');
    }
    const payload = parsed as Record<string, unknown>;

    const draft: ProfileDraft = {
      coreStack: this.toStringArray(payload.coreStack),
      strongPlus: this.toStringArray(payload.strongPlus),
      redFlags: this.toStringArray(payload.redFlags),
      locationPref: this.toStringArray(payload.locationPref),
    };

    if (typeof payload.seniority === 'string' && payload.seniority.length > 0) {
      draft.seniority = payload.seniority;
    }
    if (
      typeof payload.salaryMin === 'number' &&
      Number.isFinite(payload.salaryMin)
    ) {
      draft.salaryMin = Math.max(0, Math.round(payload.salaryMin));
    }
    if (
      typeof payload.salaryTarget === 'number' &&
      Number.isFinite(payload.salaryTarget)
    ) {
      draft.salaryTarget = Math.max(0, Math.round(payload.salaryTarget));
    }

    return draft;
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
