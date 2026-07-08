import env from "@/app/env";

export const redisConnection = {
  host: env.redis.host,
  port: env.redis.port,
};
