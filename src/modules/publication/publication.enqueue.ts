import prisma from "@/app/prisma";
import env from "@/app/env";
import { publicationQueue } from "@/modules/publication/publication.queue";

type EnqueuePendingPublicationsOptions = {
  closeConnections?: boolean;
};

export async function enqueuePendingPublications(
  options: EnqueuePendingPublicationsOptions = {},
): Promise<void> {
  const closeConnections = options.closeConnections ?? true;

  // PENDING-записи создаются после одобрения поста в канале модерации.
  const publications = await prisma.postPublication.findMany({
    where: {
      status: {
        in: ["PENDING", "PUBLISHING"],
      },
      destination: {
        status: "ACTIVE",
      },
    },
    select: {
      id: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  for (const publication of publications) {
    await enqueuePublication(publication.id);
  }

  if (closeConnections) {
    await publicationQueue.close();
    await prisma.$disconnect();
  }
}

export async function enqueuePublication(publicationId: string): Promise<void> {
  const jobId = getPublicationJobId(publicationId);
  const existingJob = await publicationQueue.getJob(jobId);

  // Одна публикация не должна выполняться двумя worker одновременно.
  if (existingJob) {
    const state = await existingJob.getState();

    if (isPendingJobState(state)) {
      console.log(`Skip publication ${publicationId}: job already ${state}`);
      return;
    }

    await existingJob.remove();
  }

  await publicationQueue.add(
    "publish-post",
    {
      publicationId,
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

  console.log(`Queued publication: ${publicationId}`);
}

function getPublicationJobId(publicationId: string): string {
  return `publication-${publicationId}`;
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
