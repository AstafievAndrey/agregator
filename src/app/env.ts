import "dotenv/config";

const env = Object.freeze({
  databaseUrl: process.env.DATABASE_URL ?? "",

  ai: Object.freeze({
    ollamaEnabled: getBooleanEnv("OLLAMA_ENABLED", true),
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://host.docker.internal:11434",
    ollamaModel: process.env.OLLAMA_MODEL ?? "qwen2.5:1.5b",
    ollamaTimeoutMs: getNumberEnv("OLLAMA_TIMEOUT_MS", 60_000),
  }),

  redis: Object.freeze({
    host: process.env.REDIS_HOST ?? "redis",
    port: Number(process.env.REDIS_PORT ?? 6379),
  }),

  telegram: Object.freeze({
    apiId: Number(process.env.TELEGRAM_API_ID),
    apiHash: process.env.TELEGRAM_API_HASH ?? "",
    session: process.env.TELEGRAM_SESSION ?? "",
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
    moderationChannelId: process.env.TELEGRAM_MODERATION_CHANNEL_ID ?? "",
    collectorIntervalMs: getNumberEnv("TELEGRAM_COLLECTOR_INTERVAL_MS", 10_000),
    moderationIntervalMs: getNumberEnv("TELEGRAM_MODERATION_INTERVAL_MS", 5_000),
    publicationIntervalMs: getNumberEnv("TELEGRAM_PUBLICATION_INTERVAL_MS", 5_000),
    freshMessageDelaySeconds: getNumberEnv("TELEGRAM_FRESH_MESSAGE_DELAY_SECONDS", 20),
    collectorConcurrency: getNumberEnv("TELEGRAM_COLLECTOR_CONCURRENCY", 2),
    moderationConcurrency: getNumberEnv("TELEGRAM_MODERATION_CONCURRENCY", 3),
    publicationConcurrency: getNumberEnv("TELEGRAM_PUBLICATION_CONCURRENCY", 3),
    retryBackoffMs: getNumberEnv("TELEGRAM_RETRY_BACKOFF_MS", 10_000),
    jobTimeoutMs: getNumberEnv("TELEGRAM_JOB_TIMEOUT_MS", 120_000),
  }),
});

function getNumberEnv(name: string, defaultValue: number): number {
  const value = process.env[name];

  if (value === undefined || value === "") {
    return defaultValue;
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    throw new Error(`${name} is required to be a positive number`);
  }

  return numberValue;
}

function getBooleanEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];

  if (value === undefined || value === "") {
    return defaultValue;
  }

  return value === "true" || value === "1" || value.toLowerCase() === "yes";
}

if (!env.databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

if (!env.redis.host) {
  throw new Error("REDIS_HOST is required");
}

if (!env.redis.port || Number.isNaN(env.redis.port)) {
  throw new Error("REDIS_PORT is required and must be a number");
}

if (!env.telegram.apiId || Number.isNaN(env.telegram.apiId)) {
  throw new Error("TELEGRAM_API_ID is required and must be a number");
}

if (!env.telegram.apiHash) {
  throw new Error("TELEGRAM_API_HASH is required");
}

export default env;
