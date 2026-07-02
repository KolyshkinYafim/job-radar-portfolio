import { ConfigService } from '@nestjs/config';
import { CandidateProfile } from '../common/types';
import { LlmCallLogger } from './llm-call-logger.service';
import { ScoringService } from './scoring.service';

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    'llm.baseUrl': 'http://llm.test/v1',
    'llm.model': 'test-model',
    'llm.apiKey': '',
    'llm.thinking': true,
    ...overrides,
  };
  return { get: (key: string) => values[key] } as ConfigService;
}

function makeLogger(): LlmCallLogger {
  return {
    log: jest.fn().mockResolvedValue(undefined),
  } as unknown as LlmCallLogger;
}

function completionResponse(
  payload: Record<string, unknown>,
  usage?: { prompt_tokens?: number; completion_tokens?: number },
) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(payload) } }],
      ...(usage ? { usage } : {}),
    }),
  };
}

const validPayload = {
  location: 'Berlin, Germany',
  seniorityMatch: 'yes',
  locationMatch: 'remote-eu',
  stackMatch: ['TypeScript', 'NestJS'],
  dealbreaker: false,
  dealbreakerReason: '',
  score: 85,
  reasonsPro: ['Core stack matches'],
  reasonsCon: [],
  redFlags: [],
};

const sampleProfile: CandidateProfile = {
  name: 'Test User',
  seniority: 'senior',
  location_preference: ['EU remote'],
  core_stack: ['TypeScript', 'NestJS'],
  strong_plus: ['AI integration'],
  red_flags: ['junior'],
  salary_target: {
    base_eur_min: 75000,
    base_eur_target: 85000,
    base_eur_stretch_ai: 115000,
  },
  company_tiers: { tier1_boost: ['Vercel'], tier2: ['Storyblok'] },
  notes: '',
};

describe('ScoringService', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue(completionResponse(validPayload));
    global.fetch = fetchMock;
  });

  it('sends the rubric and the supplied profile in the system prompt', async () => {
    const service = new ScoringService(makeConfig(), makeLogger());
    await service.scoreVacancy(
      { rawText: 'Senior TS engineer, remote EU' },
      sampleProfile,
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.messages[0].content).toContain('SCORING RUBRIC');
    expect(body.messages[0].content).toContain('HARD RULES');
    expect(body.messages[0].content).toContain('core_stack');
    expect(body.messages[0].content).toContain('Test User');
    expect(body.chat_template_kwargs).toBeUndefined();
  });

  it('caps the score and surfaces the reason when the model flags a dealbreaker', async () => {
    fetchMock.mockResolvedValue(
      completionResponse({
        ...validPayload,
        dealbreaker: true,
        dealbreakerReason: 'Onsite in Berlin only',
        score: 78,
      }),
    );
    const service = new ScoringService(makeConfig(), makeLogger());
    const result = await service.scoreVacancy(
      { rawText: 'Engineer, Berlin office' },
      sampleProfile,
    );

    expect(result.score).toBe(40);
    expect(result.redFlags).toContain('Onsite in Berlin only');
  });

  it('sends a Bearer token when an API key is configured', async () => {
    const service = new ScoringService(
      makeConfig({ 'llm.apiKey': 'secret' }),
      makeLogger(),
    );
    await service.scoreVacancy(
      { rawText: 'Senior TS engineer' },
      sampleProfile,
    );

    const headers = fetchMock.mock.calls[0][1].headers as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBe('Bearer secret');
  });

  it('disables thinking via chat template kwargs when configured off', async () => {
    const service = new ScoringService(
      makeConfig({ 'llm.thinking': false }),
      makeLogger(),
    );
    await service.scoreVacancy(
      { rawText: 'Senior TS engineer' },
      sampleProfile,
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it('logs the LLM call on success with userId, taskType and token counts from usage', async () => {
    fetchMock.mockResolvedValue(
      completionResponse(validPayload, {
        prompt_tokens: 1234,
        completion_tokens: 56,
      }),
    );
    const logger = makeLogger();
    const service = new ScoringService(makeConfig(), logger);
    await service.scoreVacancy(
      { rawText: 'Senior TS engineer' },
      sampleProfile,
      { userId: 'u-42', taskType: 'score' },
    );

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith({
      userId: 'u-42',
      taskType: 'score',
      model: 'test-model',
      promptTokens: 1234,
      completionTokens: 56,
      latencyMs: expect.any(Number),
      ok: true,
    });
  });

  it('logs an ok=false LlmCall and rethrows when the LLM fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });
    const logger = makeLogger();
    const service = new ScoringService(makeConfig(), logger);

    await expect(
      service.scoreVacancy({ rawText: 'Senior TS engineer' }, sampleProfile, {
        userId: 'u-42',
        taskType: 'score',
      }),
    ).rejects.toThrow(/status 503/);

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith({
      userId: 'u-42',
      taskType: 'score',
      model: 'test-model',
      promptTokens: 0,
      completionTokens: 0,
      latencyMs: expect.any(Number),
      ok: false,
    });
  });

  it('logs with undefined userId and taskType "score" when called without ctx', async () => {
    const logger = makeLogger();
    const service = new ScoringService(makeConfig(), logger);
    await service.scoreVacancy(
      { rawText: 'Senior TS engineer' },
      sampleProfile,
    );

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: undefined,
        taskType: 'score',
        ok: true,
      }),
    );
  });

  it('defaults missing usage tokens to zero', async () => {
    const logger = makeLogger();
    const service = new ScoringService(makeConfig(), logger);
    await service.scoreVacancy(
      { rawText: 'Senior TS engineer' },
      sampleProfile,
      { userId: 'u-42' },
    );

    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        promptTokens: 0,
        completionTokens: 0,
        ok: true,
      }),
    );
  });

  it('routes to llm.modelScore and llm.baseUrlScore when configured', async () => {
    const logger = makeLogger();
    const service = new ScoringService(
      makeConfig({
        'llm.model': 'global-model',
        'llm.baseUrl': 'http://global.test/v1',
        'llm.modelScore': 'qwen3-32b-awq',
        'llm.baseUrlScore': 'http://score.test/v1',
      }),
      logger,
    );
    await service.scoreVacancy(
      { rawText: 'Senior TS engineer' },
      sampleProfile,
      { userId: 'u-42', taskType: 'score' },
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://score.test/v1/chat/completions');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('qwen3-32b-awq');
    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'qwen3-32b-awq', taskType: 'score' }),
    );
  });

  it('falls back to llm.model and llm.baseUrl when score overrides are empty', async () => {
    const logger = makeLogger();
    const service = new ScoringService(
      makeConfig({
        'llm.model': 'global-model',
        'llm.baseUrl': 'http://global.test/v1',
        'llm.modelScore': '',
        'llm.baseUrlScore': '',
      }),
      logger,
    );
    await service.scoreVacancy(
      { rawText: 'Senior TS engineer' },
      sampleProfile,
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://global.test/v1/chat/completions');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('global-model');
  });

  it('discovers a model from /v1/models on the routed baseUrl when nothing is configured', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: 'discovered-on-score' }] }),
      })
      .mockResolvedValueOnce(completionResponse(validPayload));
    const logger = makeLogger();
    const service = new ScoringService(
      makeConfig({
        'llm.model': '',
        'llm.baseUrl': 'http://global.test/v1',
        'llm.baseUrlScore': 'http://score.test/v1',
      }),
      logger,
    );
    await service.scoreVacancy(
      { rawText: 'Senior TS engineer' },
      sampleProfile,
    );

    expect(fetchMock.mock.calls[0][0]).toBe('http://score.test/v1/models');
    expect(fetchMock.mock.calls[1][0]).toBe(
      'http://score.test/v1/chat/completions',
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'discovered-on-score' }),
    );
  });
});
