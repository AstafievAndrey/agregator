import prisma from "@/app/prisma";
import { moderationQueue } from "@/modules/telegram/moderation/moderation.queue";
import { publicationQueue } from "@/modules/telegram/publication/publication.queue";
import { telegramQueue } from "@/modules/telegram/collector/telegram.queue";

const mode = process.argv.includes("--failed") ? "failed" : "summary";

async function main(): Promise<void> {
  if (mode === "failed") {
    await printFailedStatus();
  } else {
    await printSummaryStatus();
  }
}

async function printSummaryStatus(): Promise<void> {
  const [
    sourceCount,
    destinationCount,
    sourceDestinationCount,
    postStatuses,
    moderationStatuses,
    publicationStatuses,
    queueStatuses,
    recentPosts,
    recentPublications,
  ] = await Promise.all([
    prisma.source.count({ where: { status: "ACTIVE" } }),
    prisma.destination.count({ where: { status: "ACTIVE" } }),
    prisma.sourceDestination.count(),
    countByStatus("post"),
    countByStatus("postModeration"),
    countByStatus("postPublication"),
    getQueueStatuses(),
    getRecentPosts(),
    getRecentPublications(),
  ]);

  printHeader("Agregator status");
  printLine("Active sources", sourceCount);
  printLine("Active destinations", destinationCount);
  printLine("Source links", sourceDestinationCount);

  printSection("Posts");
  printCounts(postStatuses);

  printSection("Moderation");
  printCounts(moderationStatuses);

  printSection("Publications");
  printCounts(publicationStatuses);

  printSection("Queues");
  for (const queueStatus of queueStatuses) {
    printLine(queueStatus.name, formatQueueCounts(queueStatus.counts));
  }

  printSection("Recent posts");
  if (recentPosts.length === 0) {
    console.log("No posts yet");
  } else {
    for (const post of recentPosts) {
      const source = post.source.telegram?.channelName ?? post.source.name;
      const moderation = post.moderation?.status ?? "-";
      const textPreview = previewText(post.moderation?.draftText ?? post.text);

      console.log(
        `${formatDate(post.createdAt)} | ${post.status} | moderation=${moderation} | ${source} | ${textPreview}`,
      );
    }
  }

  printSection("Recent publications");
  if (recentPublications.length === 0) {
    console.log("No publications yet");
  } else {
    for (const publication of recentPublications) {
      const destination =
        publication.destination.telegram?.channelName ??
        publication.destination.telegram?.name ??
        publication.destination.name;
      const source =
        publication.post.source.telegram?.channelName ?? publication.post.source.name;

      console.log(
        `${formatDate(publication.updatedAt)} | ${publication.status} | ${source} -> ${destination} | ${previewText(publication.post.moderation?.draftText ?? publication.post.text)}`,
      );
    }
  }
}

async function printFailedStatus(): Promise<void> {
  const [failedPublications, errorPosts, rejectedModerations, queueStatuses] =
    await Promise.all([
      prisma.postPublication.findMany({
        where: { status: "FAILED" },
        orderBy: { updatedAt: "desc" },
        take: 20,
        include: {
          destination: { include: { telegram: true } },
          post: {
            include: {
              source: { include: { telegram: true } },
              moderation: true,
            },
          },
        },
      }),
      prisma.post.findMany({
        where: { status: "ERROR" },
        orderBy: { updatedAt: "desc" },
        take: 20,
        include: {
          source: { include: { telegram: true } },
          moderation: true,
        },
      }),
      prisma.postModeration.findMany({
        where: { status: "REJECTED" },
        orderBy: { updatedAt: "desc" },
        take: 20,
        include: {
          post: {
            include: {
              source: { include: { telegram: true } },
            },
          },
        },
      }),
      getQueueStatuses(),
    ]);

  printHeader("Agregator problems");

  printSection("Queue failures");
  for (const queueStatus of queueStatuses) {
    const failedCount = queueStatus.counts.failed ?? 0;

    if (failedCount > 0) {
      printLine(queueStatus.name, `${failedCount} failed jobs`);
    }
  }

  if (queueStatuses.every((queueStatus) => (queueStatus.counts.failed ?? 0) === 0)) {
    console.log("No failed queue jobs");
  }

  printSection("Failed publications");
  if (failedPublications.length === 0) {
    console.log("No failed publications");
  } else {
    for (const publication of failedPublications) {
      const destination =
        publication.destination.telegram?.channelName ??
        publication.destination.telegram?.name ??
        publication.destination.name;
      const source =
        publication.post.source.telegram?.channelName ?? publication.post.source.name;

      console.log(
        `${formatDate(publication.updatedAt)} | ${source} -> ${destination} | ${publication.errorMessage ?? "no error message"} | ${previewText(publication.post.moderation?.draftText ?? publication.post.text)}`,
      );
    }
  }

  printSection("Error posts");
  if (errorPosts.length === 0) {
    console.log("No posts with ERROR status");
  } else {
    for (const post of errorPosts) {
      const source = post.source.telegram?.channelName ?? post.source.name;

      console.log(`${formatDate(post.updatedAt)} | ${source} | ${previewText(post.text)}`);
    }
  }

  printSection("Rejected moderations");
  if (rejectedModerations.length === 0) {
    console.log("No rejected moderations");
  } else {
    for (const moderation of rejectedModerations) {
      const source =
        moderation.post.source.telegram?.channelName ?? moderation.post.source.name;

      console.log(
        `${formatDate(moderation.updatedAt)} | ${source} | ${previewText(moderation.draftText ?? moderation.post.text)}`,
      );
    }
  }
}

async function countByStatus(
  model: "post" | "postModeration" | "postPublication",
): Promise<Record<string, number>> {
  const rows =
    model === "post"
      ? await prisma.post.groupBy({
          by: ["status"],
          _count: { _all: true },
        })
      : model === "postModeration"
        ? await prisma.postModeration.groupBy({
            by: ["status"],
            _count: { _all: true },
          })
        : await prisma.postPublication.groupBy({
            by: ["status"],
            _count: { _all: true },
          });

  return Object.fromEntries(
    rows.map((row) => [row.status, row._count._all]),
  );
}

async function getQueueStatuses(): Promise<
  Array<{ name: string; counts: Record<string, number> }>
> {
  const queues = [
    ["telegram", telegramQueue],
    ["moderation", moderationQueue],
    ["publication", publicationQueue],
  ] as const;

  return Promise.all(
    queues.map(async ([name, queue]) => ({
      name,
      counts: await queue.getJobCounts(
        "waiting",
        "active",
        "delayed",
        "completed",
        "failed",
        "paused",
      ),
    })),
  );
}

async function getRecentPosts() {
  return prisma.post.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      source: { include: { telegram: true } },
      moderation: true,
    },
  });
}

async function getRecentPublications() {
  return prisma.postPublication.findMany({
    orderBy: { updatedAt: "desc" },
    take: 10,
    include: {
      destination: { include: { telegram: true } },
      post: {
        include: {
          source: { include: { telegram: true } },
          moderation: true,
        },
      },
    },
  });
}

function printHeader(title: string): void {
  console.log("");
  console.log(title);
  console.log("=".repeat(title.length));
}

function printSection(title: string): void {
  console.log("");
  console.log(title);
  console.log("-".repeat(title.length));
}

function printLine(label: string, value: string | number): void {
  console.log(`${label.padEnd(22)} ${value}`);
}

function printCounts(counts: Record<string, number>): void {
  if (Object.keys(counts).length === 0) {
    console.log("No records");
    return;
  }

  for (const [status, count] of Object.entries(counts).sort()) {
    printLine(status, count);
  }
}

function formatQueueCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${status}=${count}`)
    .join(", ") || "empty";
}

function previewText(text: string | null | undefined): string {
  const normalizedText = text?.replace(/\s+/g, " ").trim();

  if (!normalizedText) {
    return "<no text>";
  }

  return normalizedText.length > 90
    ? `${normalizedText.slice(0, 87)}...`
    : normalizedText;
}

function formatDate(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([
      prisma.$disconnect(),
      telegramQueue.close(),
      moderationQueue.close(),
      publicationQueue.close(),
    ]);
  });
