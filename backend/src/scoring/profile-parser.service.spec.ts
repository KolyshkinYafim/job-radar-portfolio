import { ConfigService } from '@nestjs/config';
import { LlmCallLogger } from './llm-call-logger.service';
import { ProfileParserService } from './profile-parser.service';

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    'llm.baseUrl': 'http://llm.test/v1',
    'llm.model': 'score-model',
    'llm.modelParse': 'parse-model',
    'llm.apiKey': '',
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
  payload: unknown,
  usage?: { prompt_tokens?: number; completion_tokens?: number },
) {
  return {
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content:
              typeof payload === 'string' ? payload : JSON.stringify(payload),
          },
        },
      ],
      ...(usage ? { usage } : {}),
    }),
  };
}

const validPayload = {
  coreStack: ['TypeScript', 'NestJS', 'PostgreSQL'],
  strongPlus: ['AI/LLM'],
  redFlags: ['PHP-only'],
  seniority: 'senior',
  locationPref: ['Remote EU', 'Amsterdam hybrid'],
  salaryMin: 70000,
  salaryTarget: 90000,
};

describe('ProfileParserService', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue(completionResponse(validPayload));
    global.fetch = fetchMock;
  });

  it('returns a structured ProfileDraft from a valid LLM response', async () => {
    const service = new ProfileParserService(makeConfig(), makeLogger());
    const draft = await service.parseCv('CV text here');

    expect(draft).toEqual({
      coreStack: ['TypeScript', 'NestJS', 'PostgreSQL'],
      strongPlus: ['AI/LLM'],
      redFlags: ['PHP-only'],
      seniority: 'senior',
      locationPref: ['Remote EU', 'Amsterdam hybrid'],
      salaryMin: 70000,
      salaryTarget: 90000,
    });
  });

  it('omits optional fields when LLM does not provide them', async () => {
    fetchMock.mockResolvedValue(
      completionResponse({
        coreStack: ['Go'],
        strongPlus: [],
        redFlags: [],
        locationPref: [],
      }),
    );
    const service = new ProfileParserService(makeConfig(), makeLogger());
    const draft = await service.parseCv('CV text');

    expect(draft).toEqual({
      coreStack: ['Go'],
      strongPlus: [],
      redFlags: [],
      locationPref: [],
    });
    expect(draft.seniority).toBeUndefined();
    expect(draft.salaryMin).toBeUndefined();
    expect(draft.salaryTarget).toBeUndefined();
  });

  it('throws when LLM returns invalid JSON', async () => {
    fetchMock.mockResolvedValue(completionResponse('{not json'));
    const service = new ProfileParserService(makeConfig(), makeLogger());

    await expect(service.parseCv('CV text')).rejects.toThrow(/invalid JSON/i);
  });

  it('throws when LLM returns a non-object payload', async () => {
    fetchMock.mockResolvedValue(completionResponse(['just', 'an', 'array']));
    const service = new ProfileParserService(makeConfig(), makeLogger());

    await expect(service.parseCv('CV text')).rejects.toThrow(/non-object/i);
  });

  it('throws with a clear message on non-2xx LLM response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });
    const service = new ProfileParserService(makeConfig(), makeLogger());

    await expect(service.parseCv('CV text')).rejects.toThrow(
      /CV parse LLM call failed with status 503/,
    );
  });

  it('uses llm.modelParse when configured', async () => {
    const service = new ProfileParserService(makeConfig(), makeLogger());
    await service.parseCv('CV text');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.model).toBe('parse-model');
  });

  it('falls back to llm.model when llm.modelParse is unset', async () => {
    const service = new ProfileParserService(
      makeConfig({ 'llm.modelParse': '' }),
      makeLogger(),
    );
    await service.parseCv('CV text');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://llm.test/v1/chat/completions');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('score-model');
  });

  it('throws when neither llm.modelParse nor llm.model is configured', async () => {
    const service = new ProfileParserService(
      makeConfig({ 'llm.modelParse': '', 'llm.model': '' }),
      makeLogger(),
    );

    await expect(service.parseCv('CV text')).rejects.toThrow(
      /No LLM model configured/i,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends thinking=false in chat_template_kwargs', async () => {
    const service = new ProfileParserService(makeConfig(), makeLogger());
    await service.parseCv('CV text');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(body.temperature).toBe(0.1);
  });

  it('sends the system instruction and user CV in the prompt', async () => {
    const service = new ProfileParserService(makeConfig(), makeLogger());
    await service.parseCv('My CV body');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain('строгий JSON');
    expect(body.messages[1]).toEqual({ role: 'user', content: 'My CV body' });
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.name).toBe('profile_draft');
  });

  it('sends a Bearer token when an API key is configured', async () => {
    const service = new ProfileParserService(
      makeConfig({ 'llm.apiKey': 'secret' }),
      makeLogger(),
    );
    await service.parseCv('CV text');

    const headers = fetchMock.mock.calls[0][1].headers as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBe('Bearer secret');
  });

  it('logs an LlmCall with taskType "cv-parse" and undefined userId on success', async () => {
    fetchMock.mockResolvedValue(
      completionResponse(validPayload, {
        prompt_tokens: 800,
        completion_tokens: 40,
      }),
    );
    const logger = makeLogger();
    const service = new ProfileParserService(makeConfig(), logger);
    await service.parseCv('CV text here');

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith({
      userId: undefined,
      taskType: 'cv-parse',
      model: 'parse-model',
      promptTokens: 800,
      completionTokens: 40,
      latencyMs: expect.any(Number),
      ok: true,
    });
  });

  it('forwards the provided userId to the LlmCall logger on success', async () => {
    fetchMock.mockResolvedValue(
      completionResponse(validPayload, {
        prompt_tokens: 100,
        completion_tokens: 10,
      }),
    );
    const logger = makeLogger();
    const service = new ProfileParserService(makeConfig(), logger);
    await service.parseCv('CV text here', 'user-42');

    expect(logger.log).toHaveBeenCalledWith({
      userId: 'user-42',
      taskType: 'cv-parse',
      model: 'parse-model',
      promptTokens: 100,
      completionTokens: 10,
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
    const service = new ProfileParserService(makeConfig(), logger);

    await expect(service.parseCv('CV text')).rejects.toThrow(/status 503/);

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith({
      userId: undefined,
      taskType: 'cv-parse',
      model: 'parse-model',
      promptTokens: 0,
      completionTokens: 0,
      latencyMs: expect.any(Number),
      ok: false,
    });
  });

  it('routes to llm.baseUrlParse when configured', async () => {
    const service = new ProfileParserService(
      makeConfig({
        'llm.baseUrl': 'http://global.test/v1',
        'llm.baseUrlParse': 'http://parse.test/v1',
      }),
      makeLogger(),
    );
    await service.parseCv('CV text');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('http://parse.test/v1/chat/completions');
  });

  it('falls back to llm.baseUrl when llm.baseUrlParse is empty', async () => {
    const service = new ProfileParserService(
      makeConfig({
        'llm.baseUrl': 'http://global.test/v1',
        'llm.baseUrlParse': '',
      }),
      makeLogger(),
    );
    await service.parseCv('CV text');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('http://global.test/v1/chat/completions');
  });

  it('forwards the provided userId to the LlmCall logger on failure', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });
    const logger = makeLogger();
    const service = new ProfileParserService(makeConfig(), logger);

    await expect(service.parseCv('CV text', 'user-77')).rejects.toThrow(
      /status 503/,
    );

    expect(logger.log).toHaveBeenCalledWith({
      userId: 'user-77',
      taskType: 'cv-parse',
      model: 'parse-model',
      promptTokens: 0,
      completionTokens: 0,
      latencyMs: expect.any(Number),
      ok: false,
    });
  });
});
