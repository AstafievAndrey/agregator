import { Queue } from "bullmq";
import { redisConnection } from "@/app/queue";

export type SendPostToModerationJobData = {
  // В задаче храним только id поста. Все свежие данные берем из БД уже в worker.
  postId: string;
};

// Очередь отвечает только за отправку собранных постов в черновой канал модерации.
export const moderationQueue = new Queue<SendPostToModerationJobData>(
  "moderation",
  {
    connection: redisConnection,
  },
);
