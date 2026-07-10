import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import prisma from "@/app/prisma";
import {
  downloadPostMedia,
  PostWithTelegramMedia,
} from "@/modules/telegram/moderation/moderation.service";
import { sendPostToTelegramDestination } from "@/modules/telegram/publication/telegram-publication.client";

type PublicationWithPost = NonNullable<
  Awaited<ReturnType<typeof prisma.postPublication.findUnique>>
> & {
  post: PostWithTelegramMedia & {
    moderation: {
      draftText: string | null;
    } | null;
  };
  destination: {
    name: string;
    type: "TELEGRAM";
    status: "ACTIVE" | "PAUSED" | "ARCHIVED";
    telegram: {
      name: string;
      channelId: string;
      channelName: string | null;
      metadata: unknown;
    } | null;
  };
};

export async function publishPostPublication(
  publicationId: string,
): Promise<void> {
  // Загружаем одним запросом текст после модерации, медиа и настройки назначения.
  const publication = await prisma.postPublication.findUnique({
    where: {
      id: publicationId,
    },
    include: {
      post: {
        include: {
          moderation: true,
          attachments: {
            orderBy: {
              position: "asc",
            },
          },
          source: {
            include: {
              telegram: true,
            },
          },
        },
      },
      destination: {
        include: {
          telegram: true,
        },
      },
    },
  });

  if (!publication) {
    console.log(`Skip publication: ${publicationId} not found`);
    return;
  }

  if (publication.status === "PUBLISHED" || publication.status === "CANCELED") {
    console.log(
      `Skip publication ${publication.id}: already ${publication.status}`,
    );
    return;
  }

  const typedPublication = publication as PublicationWithPost;

  if (typedPublication.destination.status !== "ACTIVE") {
    await cancelPublication(typedPublication.id, "Destination is not active");
    return;
  }

  if (
    typedPublication.destination.type !== "TELEGRAM" ||
    !typedPublication.destination.telegram
  ) {
    await failPublication(
      typedPublication.id,
      "Telegram destination is not configured",
    );
    return;
  }

  // PUBLISHING показывает диагностике, что задачу уже забрал worker.
  await prisma.postPublication.update({
    where: {
      id: typedPublication.id,
    },
    data: {
      status: "PUBLISHING",
      errorMessage: null,
      failedAt: null,
    },
  });

  const tempDirectory = await mkdtemp(join(tmpdir(), "agregator-publication-"));

  try {
    // Медиа хранится локально только во время отправки и удаляется в finally.
    const mediaFiles = await downloadPostMedia(
      typedPublication.post,
      tempDirectory,
    );
    const externalPublicationId = await sendPostToTelegramDestination({
      channelId: typedPublication.destination.telegram.channelId,
      text: getPublicationTextWithFooter(typedPublication),
      mediaFiles,
    });

    await markPublicationPublished(typedPublication.id, externalPublicationId);
    await markPostPublishedIfComplete(typedPublication.postId);

    console.log(`Publication completed: ${typedPublication.id}`);
  } catch (error) {
    await failPublication(typedPublication.id, getErrorMessage(error));
    throw error;
  } finally {
    await rm(tempDirectory, {
      recursive: true,
      force: true,
    });
  }
}

function getPublicationTextWithFooter(
  publication: PublicationWithPost,
): string | null {
  // Ручная правка из черновика имеет приоритет над исходным текстом поста.
  const text = publication.post.moderation?.draftText ?? publication.post.text;
  const footer = getPublicationFooter(publication);

  if (!footer) {
    return text;
  }

  if (!text?.trim()) {
    return footer;
  }

  return `${text.trim()}\n\n${footer}`;
}

function getPublicationFooter(publication: PublicationWithPost): string | null {
  const telegramDestination = publication.destination.telegram;

  if (!telegramDestination) {
    return null;
  }

  const metadataFooter = getMetadataString(
    telegramDestination.metadata,
    "footerText",
  );

  if (metadataFooter) {
    return metadataFooter;
  }

  const title = telegramDestination.name || publication.destination.name;
  const footerUrl = getMetadataString(
    telegramDestination.metadata,
    "footerUrl",
  );

  if (footerUrl) {
    return title ? `${title}: ${footerUrl}` : footerUrl;
  }

  const channelName = telegramDestination.channelName;

  if (title && channelName) {
    return `${title} • @${channelName}`;
  }

  if (title) {
    return title;
  }

  if (channelName) {
    return `@${channelName}`;
  }

  return null;
}

function getTelegramChannelUrl(channelName: string | null): string | null {
  const normalizedChannelName = channelName?.trim().replace(/^@/, "");

  if (!normalizedChannelName) {
    return null;
  }

  return `https://t.me/${normalizedChannelName}`;
}

function getMetadataString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Record<string, unknown>)[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function markPublicationPublished(
  publicationId: string,
  externalPublicationId: string,
): Promise<void> {
  await prisma.postPublication.update({
    where: {
      id: publicationId,
    },
    data: {
      status: "PUBLISHED",
      externalPublicationId,
      publishedAt: new Date(),
      failedAt: null,
      errorMessage: null,
    },
  });
}

async function markPostPublishedIfComplete(postId: string): Promise<void> {
  // Общий Post становится PUBLISHED только после успешной отправки
  // во все связанные с его источником направления.
  const failedOrPendingPublication = await prisma.postPublication.findFirst({
    where: {
      postId,
      status: {
        not: "PUBLISHED",
      },
    },
    select: {
      id: true,
    },
  });

  if (failedOrPendingPublication) {
    return;
  }

  await prisma.post.update({
    where: {
      id: postId,
    },
    data: {
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
}

async function cancelPublication(
  publicationId: string,
  reason: string,
): Promise<void> {
  await prisma.postPublication.update({
    where: {
      id: publicationId,
    },
    data: {
      status: "CANCELED",
      failedAt: new Date(),
      errorMessage: reason,
    },
  });
}

async function failPublication(
  publicationId: string,
  reason: string,
): Promise<void> {
  await prisma.postPublication.update({
    where: {
      id: publicationId,
    },
    data: {
      status: "FAILED",
      failedAt: new Date(),
      errorMessage: reason,
    },
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
