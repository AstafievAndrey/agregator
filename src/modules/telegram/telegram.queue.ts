import { Queue } from "bullmq";
import { redisConnection } from "@/app/queue";

export type CollectTelegramSourceJobData = {
  sourceId: string;
};

export const telegramQueue = new Queue<CollectTelegramSourceJobData>(
  "telegram",
  {
    connection: redisConnection,
  },
);
