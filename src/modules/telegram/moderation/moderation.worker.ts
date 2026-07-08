import { Job, Worker } from "bullmq";
import { redisConnection } from "@/app/queue";
import { SendPostToModerationJobData } from "@/modules/telegram/moderation/moderation.queue";
import { sendPostToModeration } from "@/modules/telegram/moderation/moderation.service";

export function startModerationWorker(): Worker<SendPostToModerationJobData> {
  // Worker постоянно слушает очередь moderation и выполняет задачи по одной.
  // concurrency: 1 упрощает отладку и снижает риск гонок на первой версии.
  const worker = new Worker<SendPostToModerationJobData>(
    "moderation",
    async (job: Job<SendPostToModerationJobData>) => {
      console.log(`Start moderation job: ${job.id}`);
      console.log(`Post id: ${job.data.postId}`);

      await sendPostToModeration(job.data.postId);

      console.log(`Completed moderation job: ${job.id}`);
    },
    {
      connection: redisConnection,
      concurrency: 1,
    },
  );

  worker.on("failed", (job, error) => {
    // Ошибку не глотаем: BullMQ увидит failed job и применит attempts/backoff из enqueue.
    console.error(`Moderation job failed: ${job?.id}`);
    console.error(error);
  });

  worker.on("completed", (job) => {
    console.log(`Moderation job completed: ${job.id}`);
  });

  return worker;
}
