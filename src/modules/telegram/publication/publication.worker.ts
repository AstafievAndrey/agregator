import { Job, Worker } from "bullmq";
import env from "@/app/env";
import { redisConnection } from "@/app/queue";
import { PublishPostJobData } from "@/modules/telegram/publication/publication.queue";
import { publishPostPublication } from "@/modules/telegram/publication/publication.service";

export function startPublicationWorker(): Worker<PublishPostJobData> {
  // Worker отделяет медленную отправку в Telegram от обработки кнопки модерации.
  const worker = new Worker<PublishPostJobData>(
    "publication",
    async (job: Job<PublishPostJobData>) => {
      console.log(`Start publication job: ${job.id}`);
      console.log(`Publication id: ${job.data.publicationId}`);

      await publishPostPublication(job.data.publicationId);

      console.log(`Completed publication job: ${job.id}`);
    },
    {
      connection: redisConnection,
      concurrency: env.telegram.publicationConcurrency,
    },
  );

  worker.on("failed", (job, error) => {
    console.error(`Publication job failed: ${job?.id}`);
    console.error(error);
  });

  worker.on("completed", (job) => {
    console.log(`Publication job completed: ${job.id}`);
  });

  return worker;
}
