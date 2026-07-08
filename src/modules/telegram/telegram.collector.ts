import prisma from "@/app/prisma";
import { createTelegramClient } from "@/modules/telegram/telegram.client";

const freshMessageDelaySeconds = 60;

type TelegramMessage = {
  id: number;
  message?: string;
  date?: number;
  groupedId?: unknown;
  photo?: unknown;
  video?: unknown;
  document?: unknown;
  media?: unknown;
};

type MessageGroup = {
  externalId: string;
  messages: TelegramMessage[];
};

export async function collectTelegramPosts(): Promise<void> {
  const client = createTelegramClient();

  await client.connect();

  try {
    const sources = await prisma.source.findMany({
      where: {
        type: "TELEGRAM",
        status: "ACTIVE",
        telegram: {
          isNot: null,
        },
      },
      include: {
        telegram: true,
      },
    });

    console.log(`Found Telegram sources: ${sources.length}`);

    for (const source of sources) {
      await collectTelegramSourceWithClient(client, source.id);
    }
  } finally {
    await client.disconnect();
    await prisma.$disconnect();
  }
}

export async function collectTelegramSource(sourceId: string): Promise<void> {
  const client = createTelegramClient();

  await client.connect();

  try {
    await collectTelegramSourceWithClient(client, sourceId);
  } finally {
    await client.disconnect();
  }
}

async function collectTelegramSourceWithClient(
  client: ReturnType<typeof createTelegramClient>,
  sourceId: string,
): Promise<void> {
  const source = await prisma.source.findUnique({
    where: {
      id: sourceId,
    },
    include: {
      telegram: true,
    },
  });

  if (!source) {
    throw new Error(`Source not found: ${sourceId}`);
  }

  if (source.type !== "TELEGRAM") {
    console.log(`Skip source ${source.id}: type is ${source.type}`);
    return;
  }

  if (source.status !== "ACTIVE") {
    console.log(`Skip source ${source.id}: status is ${source.status}`);
    return;
  }

  const telegramSource = source.telegram;

  if (!telegramSource?.channelName) {
    console.log(`Skip source ${source.id}: channelName is empty`);
    return;
  }

  const channelName = telegramSource.channelName;
  const lastSyncedMessageId = telegramSource.lastSyncedMessageId;

  console.log(`Collecting messages from: ${channelName}`);
  console.log(`Last synced message id: ${lastSyncedMessageId ?? "empty"}`);

  if (lastSyncedMessageId === null) {
    const latestMessageId = await getLatestMessageId(client, channelName);

    if (latestMessageId === null) {
      console.log("No messages found. Nothing to initialize.");
      return;
    }

    await prisma.telegramSource.update({
      where: {
        id: telegramSource.id,
      },
      data: {
        lastSyncedMessageId: latestMessageId,
      },
    });

    console.log(`History skipped. Start from message id: ${latestMessageId}`);
    return;
  }

  const messages: TelegramMessage[] = [];

  for await (const message of client.iterMessages(channelName, {
    minId: lastSyncedMessageId ?? 0,
    reverse: true,
  })) {
    const telegramMessage = message as TelegramMessage;

    if (isFreshMessage(telegramMessage)) {
      console.log(`Stop on fresh message: ${telegramMessage.id}`);
      break;
    }

    messages.push(telegramMessage);
  }

  if (messages.length === 0) {
    console.log("No stable new messages");
    return;
  }

  const messageGroups = groupMessages(messages);
  const newestMessageId = getNewestMessageId(messages);

  await saveMessageGroups(source.id, telegramSource.id, messageGroups, newestMessageId);

  console.log(`Saved messages: ${messages.length}`);
  console.log(`Saved posts: ${messageGroups.length}`);
  console.log(`New last synced message id: ${newestMessageId}`);
}

async function saveMessageGroups(
  sourceId: string,
  telegramSourceId: string,
  messageGroups: MessageGroup[],
  newestMessageId: number,
): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    for (const messageGroup of messageGroups) {
      const post = await transaction.post.upsert({
        where: {
          sourceId_externalId: {
            sourceId,
            externalId: messageGroup.externalId,
          },
        },
        create: {
          sourceId,
          externalId: messageGroup.externalId,
          text: getGroupText(messageGroup),
          publishedAt: getGroupPublishedAt(messageGroup),
          status: "COLLECTED",
        },
        update: {
          text: getGroupText(messageGroup),
          publishedAt: getGroupPublishedAt(messageGroup),
          status: "COLLECTED",
        },
      });

      const attachments = getGroupAttachments(messageGroup);

      await transaction.attachment.deleteMany({
        where: {
          postId: post.id,
        },
      });

      if (attachments.length > 0) {
        await transaction.attachment.createMany({
          data: attachments.map((attachment) => ({
            ...attachment,
            postId: post.id,
          })),
        });
      }
    }

    await transaction.telegramSource.update({
      where: {
        id: telegramSourceId,
      },
      data: {
        lastSyncedMessageId: newestMessageId,
      },
    });
  });
}

async function getLatestMessageId(
  client: ReturnType<typeof createTelegramClient>,
  channelName: string,
): Promise<number | null> {
  const messages = await client.getMessages(channelName, {
    limit: 1,
  });

  const latestMessage = messages[0] as TelegramMessage | undefined;

  return latestMessage?.id ?? null;
}

function isFreshMessage(message: TelegramMessage): boolean {
  if (!message.date) {
    return false;
  }

  const messageAgeSeconds = Date.now() / 1000 - message.date;

  return messageAgeSeconds < freshMessageDelaySeconds;
}

function groupMessages(messages: TelegramMessage[]): MessageGroup[] {
  const groups = new Map<string, TelegramMessage[]>();

  for (const message of messages) {
    const externalId = getPostExternalId(message);
    const groupMessages = groups.get(externalId) ?? [];

    groupMessages.push(message);
    groups.set(externalId, groupMessages);
  }

  return [...groups.entries()].map(([externalId, groupMessages]) => ({
    externalId,
    messages: groupMessages,
  }));
}

function getPostExternalId(message: TelegramMessage): string {
  if (message.groupedId) {
    return `album:${String(message.groupedId)}`;
  }

  return `message:${message.id}`;
}

function getGroupText(group: MessageGroup): string | null {
  const messageWithText = group.messages.find((message) => message.message);

  return messageWithText?.message ?? null;
}

function getGroupPublishedAt(group: MessageGroup): Date | null {
  const firstMessage = group.messages[0];

  if (!firstMessage?.date) {
    return null;
  }

  return new Date(firstMessage.date * 1000);
}

function getGroupAttachments(group: MessageGroup) {
  const attachments = [];

  for (const message of group.messages) {
    const attachment = getAttachment(message);

    if (!attachment) {
      continue;
    }

    attachments.push({
      ...attachment,
      position: attachments.length,
    });
  }

  return attachments;
}

function getAttachment(message: TelegramMessage) {
  const photo = getPhoto(message);

  if (photo) {
    const photoSize = getLargestPhotoSize(photo);

    return {
      type: "PHOTO" as const,
      telegramFileId: getObjectId(photo) ?? String(message.id),
      fileName: null,
      mimeType: null,
      sizeBytes: getPhotoSizeBytes(photoSize),
      width: getNumber(photoSize, "w"),
      height: getNumber(photoSize, "h"),
      durationSec: null,
    };
  }

  const video = getVideo(message);

  if (video) {
    const videoAttribute = getVideoAttribute(video);

    return {
      type: "VIDEO" as const,
      telegramFileId: getObjectId(video) ?? String(message.id),
      fileName: getDocumentFileName(video),
      mimeType: getString(video, "mimeType"),
      sizeBytes: getBigInt(video, "size"),
      width: getNumber(videoAttribute, "w"),
      height: getNumber(videoAttribute, "h"),
      durationSec: getRoundedNumber(videoAttribute, "duration"),
    };
  }

  return null;
}

function getPhoto(message: TelegramMessage): unknown {
  if (message.photo) {
    return message.photo;
  }

  const media = message.media;

  if (isObject(media) && "photo" in media) {
    return media.photo;
  }

  return null;
}

function getVideo(message: TelegramMessage): unknown {
  if (message.video) {
    return message.video;
  }

  if (message.document) {
    return message.document;
  }

  const media = message.media;

  if (isObject(media) && "document" in media) {
    return media.document;
  }

  return null;
}

function getLargestPhotoSize(photo: unknown): unknown {
  if (!isObject(photo) || !Array.isArray(photo.sizes)) {
    return null;
  }

  const sizesWithDimensions = photo.sizes.filter(
    (size) => getNumber(size, "w") !== null && getNumber(size, "h") !== null,
  );

  if (sizesWithDimensions.length === 0) {
    return null;
  }

  return sizesWithDimensions.reduce((largestSize, currentSize) => {
    const largestArea =
      (getNumber(largestSize, "w") ?? 0) * (getNumber(largestSize, "h") ?? 0);
    const currentArea =
      (getNumber(currentSize, "w") ?? 0) * (getNumber(currentSize, "h") ?? 0);

    return currentArea > largestArea ? currentSize : largestSize;
  });
}

function getPhotoSizeBytes(photoSize: unknown): bigint | null {
  const directSize = getBigInt(photoSize, "size");

  if (directSize !== null) {
    return directSize;
  }

  if (!isObject(photoSize) || !Array.isArray(photoSize.sizes)) {
    return null;
  }

  const sizeValues = photoSize.sizes
    .map((size) => toBigInt(size))
    .filter((size) => size !== null);

  if (sizeValues.length === 0) {
    return null;
  }

  return sizeValues.reduce((largestSize, currentSize) =>
    currentSize > largestSize ? currentSize : largestSize,
  );
}

function getVideoAttribute(document: unknown): unknown {
  if (!isObject(document) || !Array.isArray(document.attributes)) {
    return null;
  }

  return (
    document.attributes.find(
      (attribute) =>
        isObject(attribute) && attribute.className === "DocumentAttributeVideo",
    ) ?? null
  );
}

function getDocumentFileName(document: unknown): string | null {
  if (!isObject(document) || !Array.isArray(document.attributes)) {
    return null;
  }

  const fileNameAttribute = document.attributes.find(
    (attribute) =>
      isObject(attribute) &&
      attribute.className === "DocumentAttributeFilename",
  );

  return getString(fileNameAttribute, "fileName");
}

function getObjectId(value: unknown): string | null {
  if (!isObject(value) || !("id" in value)) {
    return null;
  }

  return String(value.id);
}

function getString(value: unknown, key: string): string | null {
  if (!isObject(value) || !(key in value)) {
    return null;
  }

  const fieldValue = value[key];

  return typeof fieldValue === "string" ? fieldValue : null;
}

function getNumber(value: unknown, key: string): number | null {
  if (!isObject(value) || !(key in value)) {
    return null;
  }

  const fieldValue = value[key];

  if (typeof fieldValue === "number") {
    return fieldValue;
  }

  if (typeof fieldValue === "string") {
    const numberValue = Number(fieldValue);

    return Number.isNaN(numberValue) ? null : numberValue;
  }

  return null;
}

function getRoundedNumber(value: unknown, key: string): number | null {
  const numberValue = getNumber(value, key);

  return numberValue === null ? null : Math.round(numberValue);
}

function getBigInt(value: unknown, key: string): bigint | null {
  if (!isObject(value) || !(key in value)) {
    return null;
  }

  return toBigInt(value[key]);
}

function toBigInt(value: unknown): bigint | null {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(value);
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    return BigInt(value);
  }

  return null;
}

function getNewestMessageId(messages: TelegramMessage[]): number {
  return Math.max(...messages.map((message) => message.id));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
