import { ConfigService } from '@nestjs/config';

export type LlmTaskType = 'score' | 'cv-parse' | 'extract';

const DEFAULT_BASE_URL = 'http://127.0.0.1:1234/v1';

const SUFFIX_BY_TASK: Record<LlmTaskType, string> = {
  score: 'Score',
  'cv-parse': 'Parse',
  extract: 'Extract',
};

export interface LlmRouting {
  model: string;
  baseUrl: string;
}

export function resolveLlmRouting(
  config: ConfigService,
  taskType: LlmTaskType,
): LlmRouting {
  const suffix = SUFFIX_BY_TASK[taskType];
  const model =
    config.get<string>(`llm.model${suffix}`) ||
    config.get<string>('llm.model') ||
    '';
  const baseUrl =
    config.get<string>(`llm.baseUrl${suffix}`) ||
    config.get<string>('llm.baseUrl') ||
    DEFAULT_BASE_URL;
  return { model, baseUrl };
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', '']);

export function isRemoteBaseUrl(baseUrl: string): boolean {
  try {
    return !LOCAL_HOSTS.has(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
}
