import { Queue } from "bullmq";
import { redisConnection } from "@/app/queue";

export type SendPostToModerationJobData = {
  // В задаче храним только id поста. Актуальные данные worker берет из БД.
  postId: string;
};

// Очередь отвечает за отправку собранных постов в черновой канал модерации.
export const moderationQueue = new Queue<SendPostToModerationJobData>(
  "moderation",
  {
    connection: redisConnection,
  },
);
