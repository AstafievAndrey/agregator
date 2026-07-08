import prisma from "@/app/prisma";
import { moderationQueue } from "@/modules/telegram/moderation/moderation.queue";

type EnqueueCollectedPostsOptions = {
  closeConnections?: boolean;
};

export async function enqueueCollectedPostsForModeration(
  options: EnqueueCollectedPostsOptions = {},
): Promise<void> {
  const closeConnections = options.closeConnections ?? true;

  // Берем только собранные посты, которые еще не отправлялись на модерацию.
  // Текст не обязателен: пост может состоять только из фото или видео.
  const posts = await prisma.post.findMany({
    where: {
      status: "COLLECTED",
      moderation: null,
    },
    select: {
      id: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  for (const post of posts) {
    // Стабильный jobId не дает одному и тому же посту попасть в очередь несколько раз.
    const jobId = getModerationJobId(post.id);
    const existingJob = await moderationQueue.getJob(jobId);

    if (existingJob) {
      const state = await existingJob.getState();

      if (isPendingJobState(state)) {
        console.log(`Skip post ${post.id}: moderation job already ${state}`);
        continue;
      }

      // Старую завершенную/упавшую задачу удаляем, чтобы BullMQ разрешил создать новую.
      await existingJob.remove();
    }

    await moderationQueue.add(
      "send-post-to-moderation",
      {
        postId: post.id,
      },
      {
        jobId,
        // Если Telegram временно недоступен, BullMQ повторит отправку с задержкой.
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: 30_000,
        },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );

    console.log(`Queued post for moderation: ${post.id}`);
  }

  if (closeConnections) {
    // Одноразовые scripts должны закрывать соединения. Scheduler держит их открытыми.
    await moderationQueue.close();
    await prisma.$disconnect();
  }
}

function getModerationJobId(postId: string): string {
  return `moderation-post-${postId}`;
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
