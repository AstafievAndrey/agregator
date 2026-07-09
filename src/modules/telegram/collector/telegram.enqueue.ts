import prisma from "@/app/prisma";
import env from "@/app/env";
import { telegramQueue } from "@/modules/telegram/collector/telegram.queue";

type EnqueueActiveTelegramSourcesOptions = {
  closeConnections?: boolean;
};

export async function enqueueActiveTelegramSources(
  options: EnqueueActiveTelegramSourcesOptions = {},
): Promise<void> {
  const closeConnections = options.closeConnections ?? true;

  const sources = await prisma.source.findMany({
    where: {
      type: "TELEGRAM",
      status: "ACTIVE",
      telegram: {
        isNot: null,
      },
    },
  });

  for (const source of sources) {
    const jobId = getCollectSourceJobId(source.id);
    const existingJob = await telegramQueue.getJob(jobId);

    if (existingJob) {
      const state = await existingJob.getState();

      if (isPendingJobState(state)) {
        console.log(`Skip source ${source.id}: job already ${state}`);
        continue;
      }

      await existingJob.remove();
    }

    await telegramQueue.add(
      "collect-source",
      {
        sourceId: source.id,
      },
      {
        jobId,
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: env.telegram.retryBackoffMs,
        },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );

    console.log(`Queued source: ${source.id}`);
  }

  if (closeConnections) {
    await telegramQueue.close();
    await prisma.$disconnect();
  }
}

function getCollectSourceJobId(sourceId: string): string {
  return `collect-source-${sourceId}`;
}

function isPendingJobState(state: string): boolean {
  return (
    state === "waiting" ||
    state === "active" ||
    state === "delayed" ||
    state === "prioritized" ||
    state === "waiting-children"
  );
}
