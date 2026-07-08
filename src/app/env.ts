import "dotenv/config";

const env = Object.freeze({
  databaseUrl: process.env.DATABASE_URL ?? "",

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
  }),
});

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
