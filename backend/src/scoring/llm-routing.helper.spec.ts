import { ConfigService } from '@nestjs/config';
import { resolveLlmRouting } from './llm-routing.helper';

function makeConfig(values: Record<string, unknown>): ConfigService {
  return { get: (key: string) => values[key] } as ConfigService;
}

describe('resolveLlmRouting', () => {
  it('prefers per-task model and baseUrl when set', () => {
    const config = makeConfig({
      'llm.model': 'global-model',
      'llm.modelScore': 'score-model',
      'llm.modelParse': 'parse-model',
      'llm.modelExtract': 'extract-model',
      'llm.baseUrl': 'http://global.test/v1',
      'llm.baseUrlScore': 'http://score.test/v1',
      'llm.baseUrlParse': 'http://parse.test/v1',
      'llm.baseUrlExtract': 'http://extract.test/v1',
    });

    expect(resolveLlmRouting(config, 'score')).toEqual({
      model: 'score-model',
      baseUrl: 'http://score.test/v1',
    });
    expect(resolveLlmRouting(config, 'cv-parse')).toEqual({
      model: 'parse-model',
      baseUrl: 'http://parse.test/v1',
    });
    expect(resolveLlmRouting(config, 'extract')).toEqual({
      model: 'extract-model',
      baseUrl: 'http://extract.test/v1',
    });
  });

  it('falls back to llm.model and llm.baseUrl when per-task values are empty', () => {
    const config = makeConfig({
      'llm.model': 'global-model',
      'llm.modelScore': '',
      'llm.modelParse': '',
      'llm.baseUrl': 'http://global.test/v1',
      'llm.baseUrlScore': '',
      'llm.baseUrlParse': '',
    });

    expect(resolveLlmRouting(config, 'score')).toEqual({
      model: 'global-model',
      baseUrl: 'http://global.test/v1',
    });
    expect(resolveLlmRouting(config, 'cv-parse')).toEqual({
      model: 'global-model',
      baseUrl: 'http://global.test/v1',
    });
  });

  it('returns empty model when neither per-task nor global is set', () => {
    const config = makeConfig({
      'llm.model': '',
      'llm.baseUrl': 'http://global.test/v1',
    });

    expect(resolveLlmRouting(config, 'score').model).toBe('');
    expect(resolveLlmRouting(config, 'cv-parse').model).toBe('');
  });

  it('uses the built-in default baseUrl when nothing is configured', () => {
    const config = makeConfig({});
    expect(resolveLlmRouting(config, 'score').baseUrl).toBe(
      'http://127.0.0.1:1234/v1',
    );
  });

  it('routes cv-parse via the Parse suffix and extract via Extract', () => {
    const config = makeConfig({
      'llm.model': 'global-model',
      'llm.modelParse': 'parse-model',
      'llm.modelExtract': 'extract-model',
      'llm.baseUrl': 'http://global.test/v1',
    });

    expect(resolveLlmRouting(config, 'cv-parse').model).toBe('parse-model');
    expect(resolveLlmRouting(config, 'extract').model).toBe('extract-model');
  });
});
