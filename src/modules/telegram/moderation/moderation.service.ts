import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import prisma from "@/app/prisma";
import { createTelegramClient } from "@/modules/telegram/collector/telegram.client";
import {
  ModerationMediaFile,
  sendPostToModerationChannel,
} from "@/modules/telegram/moderation/telegram-moderation.client";

type DownloadedMediaFile = ModerationMediaFile & {
  path: string;
};

type PostForModeration = NonNullable<
  Awaited<ReturnType<typeof prisma.post.findUnique>>
> & {
  attachments: Array<{
    type: "PHOTO" | "VIDEO";
    position: number;
    telegramMessageId: number | null;
    mimeType: string | null;
    fileName: string | null;
  }>;
  source: {
    telegram: {
      channelName: string | null;
    } | null;
  };
};

export async function sendPostToModeration(postId: string): Promise<void> {
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

  if (post.status !== "COLLECTED" || post.moderation) {
    console.log(`Skip moderation: post ${post.id} is already processed`);
    return;
  }

  if (!post.text?.trim() && post.attachments.length === 0) {
    console.log(`Skip moderation: post ${post.id} has no text and no media`);
    return;
  }

  const tempDirectory = await mkdtemp(join(tmpdir(), "agregator-media-"));

  try {
    const mediaFiles = await downloadPostMedia(post as PostForModeration, tempDirectory);

    // Сначала отправляем пост в Telegram. Внешний API нельзя откатить транзакцией БД,
    // поэтому состояние базы меняем только после успешной отправки.
    const draftMessageId = await sendPostToModerationChannel({
      postId: post.id,
      text: post.text,
      mediaFiles,
    });

    // Одной транзакцией фиксируем два факта:
    // 1. У поста появилась запись модерации.
    // 2. Пост больше не должен попадать в выборку COLLECTED.
    await prisma.$transaction([
      prisma.postModeration.create({
        data: {
          postId: post.id,
          status: "SENT",
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

async function downloadPostMedia(
  post: PostForModeration,
  tempDirectory: string,
): Promise<DownloadedMediaFile[]> {
  if (post.attachments.length === 0) {
    return [];
  }

  const channelName = post.source.telegram?.channelName;

  if (!channelName) {
    throw new Error(`Cannot download media for post ${post.id}: channelName is empty`);
  }

  const client = createTelegramClient();

  await client.connect();

  try {
    const files: DownloadedMediaFile[] = [];

    for (const attachment of post.attachments) {
      // Для новых вложений берем telegramMessageId из Attachment.
      // Для старых одиночных постов можем восстановить id из externalId вида message:123.
      const telegramMessageId =
        attachment.telegramMessageId ?? getMessageIdFromExternalId(post.externalId);

      if (!telegramMessageId) {
        throw new Error(
          `Cannot download attachment ${attachment.position}: telegramMessageId is empty`,
        );
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
    await client.disconnect();
  }
}

function getMessageIdFromExternalId(externalId: string): number | null {
  const match = /^message:(\d+)$/.exec(externalId);

  return match ? Number(match[1]) : null;
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
