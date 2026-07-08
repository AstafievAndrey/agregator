import prisma from "@/app/prisma";
import { moderationQueue } from "@/modules/telegram/moderation/moderation.queue";

type EnqueueCollectedPostsOptions = {
  closeConnections?: boolean;
};

export async function enqueueCollectedPostsForModeration(
  options: EnqueueCollectedPostsOptions = {},
): Promise<void> {
  const closeConnections = options.closeConnections ?? true;

  // Берем только посты, которые уже собраны, но еще не отправлялись на модерацию.
  // moderation: null защищает от повторной постановки задачи для уже обработанного поста.
  const posts = await prisma.post.findMany({
    where: {
      status: "COLLECTED",
      text: {
        not: null,
      },
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
    // Стабильный jobId нужен, чтобы один и тот же пост не оказался в очереди несколько раз.
    const jobId = getModerationJobId(post.id);
    const existingJob = await moderationQueue.getJob(jobId);

    if (existingJob) {
      const state = await existingJob.getState();

      if (isPendingJobState(state)) {
        console.log(`Skip post ${post.id}: moderation job already ${state}`);
        continue;
      }

      // Завершенную/упавшую старую задачу убираем, чтобы BullMQ разрешил создать новую с тем же jobId.
      await existingJob.remove();
    }

    await moderationQueue.add(
      "send-post-to-moderation",
      {
        postId: post.id,
      },
      {
        jobId,
        // Если Telegram временно недоступен, BullMQ сам повторит отправку.
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
    // closeConnections нужен для одноразовых scripts. Scheduler держит соединения открытыми.
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
