const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export default () => ({
  port: toInt(process.env.PORT, 3000),
  databaseUrl: process.env.DATABASE_URL,
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: toInt(process.env.REDIS_PORT, 6379),
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    whitelistChatId: process.env.TELEGRAM_WHITELIST_CHAT_ID,
    apiId: toInt(process.env.TELEGRAM_API_ID, 0),
    apiHash: process.env.TELEGRAM_API_HASH || '',
    session: process.env.TELEGRAM_SESSION || '',
  },
  llm: {
    baseUrl: process.env.LLM_BASE_URL || 'http://127.0.0.1:1234/v1',
    baseUrlScore: process.env.LLM_BASE_URL_SCORE || '',
    baseUrlParse: process.env.LLM_BASE_URL_PARSE || '',
    baseUrlExtract: process.env.LLM_BASE_URL_EXTRACT || '',
    model: process.env.LLM_MODEL || '',
    modelScore: process.env.LLM_MODEL_SCORE || '',
    modelParse: process.env.LLM_MODEL_PARSE || '',
    modelExtract: process.env.LLM_MODEL_EXTRACT || '',
    apiKey: process.env.LLM_API_KEY || '',
    thinking: process.env.LLM_THINKING !== 'false',
  },
  scoringThreshold: toInt(process.env.SCORING_THRESHOLD, 65),
  scoringConcurrency: toInt(process.env.SCORING_CONCURRENCY, 1),
  auth: {
    ownerEmail: process.env.OWNER_EMAIL || 'owner@local',
    betaEmails: process.env.BETA_EMAILS || '',
    sessionTtlMinutes: toInt(process.env.SESSION_TTL_MINUTES, 30),
    secureCookies: process.env.NODE_ENV === 'production',
    exposeLinkInResponse: process.env.NODE_ENV !== 'production',
  },
});
