import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import prisma from "@/app/prisma";
import env from "@/app/env";
import { createTelegramClient } from "@/modules/telegram/collector/telegram.client";
import {
  ModerationMediaFile,
  sendPostToModerationChannel,
} from "@/modules/telegram/moderation/telegram-moderation.client";
import { preparePostTextForModeration } from "@/modules/telegram/moderation/moderation-text.service";

const MAX_MODERATION_UPLOAD_BYTES = 45 * 1024 * 1024;
const MEDIA_SKIPPED_NOTE =
  "[Служебно: часть медиа не отправлена в черновик из-за размера.]";

export type DownloadedMediaFile = ModerationMediaFile & {
  path: string;
};

export type PostWithTelegramMedia = NonNullable<
  Awaited<ReturnType<typeof prisma.post.findUnique>>
> & {
  attachments: Array<{
    id: string;
    type: "PHOTO" | "VIDEO";
    position: number;
    telegramMessageId: number | null;
    mimeType: string | null;
    fileName: string | null;
  }>;
  source: {
    name: string;
    telegram: {
      channelName: string | null;
      metadata?: unknown;
    } | null;
  };
};

export async function sendPostToModeration(
  postId: string,
  signal?: AbortSignal,
): Promise<void> {
  // Загружаем пост вместе с модерацией, вложениями и Telegram-источником.
  // Так worker сразу понимает: можно ли отправлять пост и откуда скачать медиа.
  const post = await prisma.post.findUnique({
    where: {
      id: postId,
    },
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
  });

  if (!post) {
    console.log(`Skip moderation: post ${postId} not found`);
    return;
  }

  if (post.status !== "COLLECTED") {
    console.log(`Skip moderation: post ${post.id} is already processed`);
    return;
  }

  if (post.moderation && post.moderation.status !== "PENDING") {
    console.log(`Skip moderation: post ${post.id} is already ${post.moderation.status}`);
    return;
  }

  if (!post.text?.trim() && post.attachments.length === 0) {
    console.log(`Skip moderation: post ${post.id} has no text and no media`);
    return;
  }

  const tempDirectory = await mkdtemp(join(tmpdir(), "agregator-media-"));

  try {
    const mediaFiles = await downloadPostMedia(
      post as PostWithTelegramMedia,
      tempDirectory,
      signal,
    );
    const moderationMedia = await limitModerationMediaFiles(mediaFiles);
    const draftText =
      post.moderation?.draftText ??
      (await preparePostTextForModeration(post.text, {
        sourceName: post.source.name,
        sourceChannelName: post.source.telegram?.channelName,
      }));
    const moderationText =
      moderationMedia.skippedCount > 0
        ? appendServiceNote(draftText, MEDIA_SKIPPED_NOTE)
        : draftText;

    if (!post.moderation) {
      await prisma.postModeration.create({
        data: {
          postId: post.id,
          status: "PENDING",
          draftText,
        },
      });
    } else if (!post.moderation.draftText && draftText) {
      await prisma.postModeration.update({
        where: {
          postId: post.id,
        },
        data: {
          draftText,
        },
      });
    }

    // Сначала отправляем пост в Telegram. Внешний API нельзя откатить транзакцией БД,
    // поэтому состояние базы меняем только после успешной отправки.
    const draftMessageId = await sendPostToModerationChannel({
      postId: post.id,
      chatId: getModerationChannelId(post as PostWithTelegramMedia),
      text: moderationText,
      mediaFiles: moderationMedia.files,
    });

    // Одной транзакцией фиксируем два факта:
    // 1. У поста появилась запись модерации.
    // 2. Пост больше не должен попадать в выборку COLLECTED.
    await prisma.$transaction([
      prisma.postModeration.update({
        where: {
          postId: post.id,
        },
        data: {
          status: "SENT",
          draftText,
          draftMessageId: String(draftMessageId),
          sentAt: new Date(),
        },
      }),
      prisma.post.update({
        where: {
          id: post.id,
        },
        data: {
          status: "SENT_TO_MODERATION",
        },
      }),
    ]);

    console.log(`Post sent to moderation: ${post.id}`);
  } finally {
    // Файлы нужны только на момент отправки в черновик.
    // После отправки удаляем временную папку, чтобы не хранить медиа у себя постоянно.
    await rm(tempDirectory, {
      recursive: true,
      force: true,
    });
  }
}

export async function downloadPostMedia(
  post: PostWithTelegramMedia,
  tempDirectory: string,
  signal?: AbortSignal,
): Promise<DownloadedMediaFile[]> {
  if (post.attachments.length === 0) {
    return [];
  }

  const channelName = post.source.telegram?.channelName;

  if (!channelName) {
    throw new Error(`Cannot download media for post ${post.id}: channelName is empty`);
  }

  const client = createTelegramClient();
  const abortClient = () => void client.destroy().catch(logDestroyError);

  signal?.addEventListener("abort", abortClient, { once: true });

  try {
    await client.connect();
    const files: DownloadedMediaFile[] = [];
    const albumMessageIds = await getAlbumMessageIdsForPost(
      client,
      channelName,
      post.externalId,
    );

    for (const attachment of post.attachments) {
      // Для новых вложений берем telegramMessageId из Attachment.
      // Для старых одиночных постов можем восстановить id из externalId вида message:123.
      // Для старых альбомов ищем сообщения по groupedId и берем id по позиции вложения.
      const telegramMessageId =
        attachment.telegramMessageId ??
        getMessageIdFromExternalId(post.externalId) ??
        albumMessageIds[attachment.position] ??
        null;

      if (!telegramMessageId) {
        throw new Error(
          `Cannot download attachment ${attachment.position}: telegramMessageId is empty`,
        );
      }

      if (!attachment.telegramMessageId) {
        await prisma.attachment.update({
          where: {
            id: attachment.id,
          },
          data: {
            telegramMessageId,
          },
        });
      }

      const messages = await client.getMessages(channelName, {
        ids: telegramMessageId,
      });
      const message = messages[0];

      if (!message) {
        throw new Error(`Telegram message not found: ${telegramMessageId}`);
      }

      const fileName = getTemporaryFileName(post.id, attachment.position, attachment.type);
      const filePath = join(tempDirectory, fileName);

      // GramJS скачивает файл из исходного Telegram-сообщения во временную папку.
      // В постоянное хранилище проекта этот файл не попадает.
      const downloadedFile = await client.downloadMedia(message, {
        outputFile: filePath,
      });

      if (!downloadedFile) {
        throw new Error(`Failed to download media from message ${telegramMessageId}`);
      }

      files.push({
        type: attachment.type,
        path: filePath,
        fileName: attachment.fileName ?? fileName,
        mimeType: attachment.mimeType ?? getDefaultMimeType(attachment.type),
      });
    }

    return files;
  } finally {
    signal?.removeEventListener("abort", abortClient);
    await client.destroy();
  }
}

function logDestroyError(error: unknown): void {
  console.error("Failed to destroy timed out Telegram media client");
  console.error(error);
}

async function limitModerationMediaFiles(
  mediaFiles: DownloadedMediaFile[],
): Promise<{ files: DownloadedMediaFile[]; skippedCount: number }> {
  const files: DownloadedMediaFile[] = [];
  let totalBytes = 0;
  let skippedCount = 0;

  for (const mediaFile of mediaFiles) {
    const fileSize = (await stat(mediaFile.path)).size;

    if (
      fileSize > MAX_MODERATION_UPLOAD_BYTES ||
      totalBytes + fileSize > MAX_MODERATION_UPLOAD_BYTES
    ) {
      skippedCount += 1;
      console.warn(
        `Skip moderation media ${mediaFile.fileName}: ${fileSize} bytes is too large`,
      );
      continue;
    }

    files.push(mediaFile);
    totalBytes += fileSize;
  }

  return {
    files,
    skippedCount,
  };
}

function appendServiceNote(text: string | null, note: string): string {
  const trimmedText = text?.trim();

  return trimmedText ? `${trimmedText}\n\n${note}` : note;
}

function getModerationChannelId(post: PostWithTelegramMedia): string {
  const metadata = post.source.telegram?.metadata;
  const sourceModerationChannelId =
    isRecord(metadata) && typeof metadata.moderationChannelId === "string"
      ? metadata.moderationChannelId.trim()
      : "";

  const moderationChannelId =
    sourceModerationChannelId || env.telegram.moderationChannelId;

  if (!moderationChannelId) {
    throw new Error(
      `Cannot send post ${post.id} to moderation: moderation channel is not configured`,
    );
  }

  return moderationChannelId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getMessageIdFromExternalId(externalId: string): number | null {
  const match = /^message:(\d+)$/.exec(externalId);

  return match ? Number(match[1]) : null;
}

async function getAlbumMessageIdsForPost(
  client: ReturnType<typeof createTelegramClient>,
  channelName: string,
  externalId: string,
): Promise<number[]> {
  const groupedId = getGroupedIdFromExternalId(externalId);

  if (!groupedId) {
    return [];
  }

  const messageIds: number[] = [];

  // Fallback нужен для постов, которые были собраны до появления telegramMessageId.
  // Ищем альбом среди недавних сообщений канала по Telegram groupedId.
  for await (const message of client.iterMessages(channelName, {
    limit: 200,
  })) {
    const telegramMessage = message as {
      id?: number;
      groupedId?: unknown;
    };

    if (String(telegramMessage.groupedId) !== groupedId || !telegramMessage.id) {
      continue;
    }

    messageIds.push(telegramMessage.id);
  }

  return messageIds.sort((leftMessageId, rightMessageId) => leftMessageId - rightMessageId);
}

function getGroupedIdFromExternalId(externalId: string): string | null {
  const match = /^album:(.+)$/.exec(externalId);

  return match?.[1] ?? null;
}

function getTemporaryFileName(
  postId: string,
  position: number,
  type: "PHOTO" | "VIDEO",
): string {
  const extension = type === "PHOTO" ? "jpg" : "mp4";

  return `${postId}-${position}.${extension}`;
}

function getDefaultMimeType(type: "PHOTO" | "VIDEO"): string {
  return type === "PHOTO" ? "image/jpeg" : "video/mp4";
}
