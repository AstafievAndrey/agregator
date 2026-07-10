import { Job, Worker } from "bullmq";
import env from "@/app/env";
import { redisConnection } from "@/app/queue";
import { collectTelegramSource } from "@/modules/telegram/collector/telegram.collector";
import { CollectTelegramSourceJobData } from "@/modules/telegram/collector/telegram.queue";

export function startTelegramWorker(): Worker<CollectTelegramSourceJobData> {
  // Worker получает только sourceId, а актуальные настройки всегда читает из БД.
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
      concurrency: env.telegram.collectorConcurrency,
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
