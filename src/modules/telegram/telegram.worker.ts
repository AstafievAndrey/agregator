import { Job, Worker } from "bullmq";
import { redisConnection } from "@/app/queue";
import { collectTelegramSource } from "@/modules/telegram/telegram.collector";
import { CollectTelegramSourceJobData } from "@/modules/telegram/telegram.queue";

export function startTelegramWorker(): Worker<CollectTelegramSourceJobData> {
  const worker = new Worker<CollectTelegramSourceJobData>(
    "telegram",
    async (job: Job<CollectTelegramSourceJobData>) => {
      console.log(`Start Telegram job: ${job.id}`);
      console.log(`Source id: ${job.data.sourceId}`);

      await collectTelegramSource(job.data.sourceId);

      console.log(`Completed Telegram job: ${job.id}`);
    },
    {
      connection: redisConnection,
      concurrency: 1,
    },
  );

  worker.on("failed", (job, error) => {
    console.error(`Telegram job failed: ${job?.id}`);
    console.error(error);
  });

  worker.on("completed", (job) => {
    console.log(`Telegram job completed: ${job.id}`);
  });

  return worker;
}
