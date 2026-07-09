import { Queue } from "bullmq";
import { redisConnection } from "@/app/queue";

export type PublishPostJobData = {
  publicationId: string;
};

export const publicationQueue = new Queue<PublishPostJobData>("publication", {
  connection: redisConnection,
});
