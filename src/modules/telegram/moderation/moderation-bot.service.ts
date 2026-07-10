import prisma from "@/app/prisma";
import {
  answerCallbackQuery,
  getCallbackUpdates,
  removeMessageKeyboard,
  TelegramCallbackQuery,
} from "@/modules/telegram/moderation/moderation-bot.client";
import { enqueuePublication } from "@/modules/telegram/publication/publication.enqueue";

const MEDIA_SKIPPED_NOTE_PATTERN =
  /\n*\[Служебно: часть медиа не отправлена в черновик из-за размера\.\]\s*$/u;

type ModerationAction = "publish" | "reject";

type ParsedCallbackData = {
  action: ModerationAction;
  postId: string;
};

export async function startModerationBot(): Promise<void> {
  let offset: number | undefined;

  console.log("Moderation bot polling started");

  while (true) {
    try {
      const updates = await getCallbackUpdates(offset);

      for (const update of updates) {
        if (!update.callback_query) {
          offset = update.update_id + 1;
          continue;
        }

        try {
          await handleModerationCallback(update.callback_query);
        } catch (error) {
          console.error("Moderation callback failed");
          console.error(error);
        } finally {
          offset = update.update_id + 1;
        }
      }
    } catch (error) {
      console.error("Moderation bot polling failed");
      console.error(error);

      await delay(3_000);
    }
  }
}

async function handleModerationCallback(
  callbackQuery: TelegramCallbackQuery,
): Promise<void> {
  const callbackData = parseCallbackData(callbackQuery.data);

  if (!callbackData) {
    await answerCallbackQuery(callbackQuery.id, "Неизвестная команда");
    return;
  }

  if (callbackData.action === "reject") {
    await rejectPost(callbackQuery, callbackData.postId);
    return;
  }

  await approvePost(callbackQuery, callbackData.postId);
}

async function rejectPost(
  callbackQuery: TelegramCallbackQuery,
  postId: string,
): Promise<void> {
  const post = await prisma.post.findUnique({
    where: {
      id: postId,
    },
    include: {
      moderation: true,
    },
  });

  if (!post || !post.moderation) {
    await answerCallbackQuery(callbackQuery.id, "Пост не найден");
    return;
  }

  if (post.moderation.status !== "SENT") {
    await answerCallbackQuery(callbackQuery.id, "Пост уже обработан");
    await removeKeyboardIfPossible(callbackQuery);
    return;
  }

  await answerCallbackQuery(callbackQuery.id, "Отклоняю...");

  const updatedModeration = await prisma.postModeration.updateMany({
    where: {
      postId: post.id,
      status: "SENT",
    },
    data: {
      status: "REJECTED",
      moderatedAt: new Date(),
    },
  });

  if (updatedModeration.count === 0) {
    await removeKeyboardIfPossible(callbackQuery);
    return;
  }

  await prisma.post.update({
    where: {
      id: post.id,
    },
    data: {
      status: "REJECTED",
    },
  });

  await removeKeyboardIfPossible(callbackQuery);
}

async function approvePost(
  callbackQuery: TelegramCallbackQuery,
  postId: string,
): Promise<void> {
  const post = await prisma.post.findUnique({
    where: {
      id: postId,
    },
    include: {
      moderation: true,
      source: {
        include: {
          destinations: {
            where: {
              destination: {
                status: "ACTIVE",
              },
            },
          },
        },
      },
    },
  });

  if (!post || !post.moderation) {
    await answerCallbackQuery(callbackQuery.id, "Пост не найден");
    return;
  }

  if (post.moderation.status !== "SENT") {
    await answerCallbackQuery(callbackQuery.id, "Пост уже обработан");
    await removeKeyboardIfPossible(callbackQuery);
    return;
  }

  const moderation = post.moderation;
  const destinationIds = post.source.destinations.map(
    (sourceDestination) => sourceDestination.destinationId,
  );

  if (destinationIds.length === 0) {
    await answerCallbackQuery(callbackQuery.id, "Для источника не настроены направления");
    return;
  }

  await answerCallbackQuery(callbackQuery.id, "Принял в публикацию...");

  const draftText = getEditedDraftText(
    callbackQuery,
    moderation.draftText ?? post.text,
  );

  const publications = await prisma.$transaction(async (transaction) => {
    const updatedModeration = await transaction.postModeration.updateMany({
      where: {
        postId: post.id,
        status: "SENT",
      },
      data: {
        status: "APPROVED",
        draftText: draftText ?? moderation.draftText,
        moderatedAt: new Date(),
      },
    });

    if (updatedModeration.count === 0) {
      return [];
    }

    await transaction.postPublication.createMany({
      data: destinationIds.map((destinationId) => ({
        postId: post.id,
        destinationId,
        status: "PENDING",
      })),
      skipDuplicates: true,
    });

    return transaction.postPublication.findMany({
      where: {
        postId: post.id,
        destinationId: {
          in: destinationIds,
        },
        status: "PENDING",
      },
      select: {
        id: true,
      },
    });
  });

  for (const publication of publications) {
    await enqueuePublication(publication.id);
  }

  await removeKeyboardIfPossible(callbackQuery);
}

function parseCallbackData(data: string | undefined): ParsedCallbackData | null {
  if (!data) {
    return null;
  }

  const [action, postId] = data.split(":");

  if ((action !== "publish" && action !== "reject") || !postId) {
    return null;
  }

  return {
    action,
    postId,
  };
}

function getEditedDraftText(
  callbackQuery: TelegramCallbackQuery,
  originalText: string | null,
): string | null {
  const currentText = stripServiceNotes(
    callbackQuery.message?.text ?? callbackQuery.message?.caption ?? null,
  );

  if (!currentText?.trim()) {
    return null;
  }

  if (currentText.trim() === originalText?.trim()) {
    return null;
  }

  return currentText;
}

function stripServiceNotes(text: string | null): string | null {
  return text?.replace(MEDIA_SKIPPED_NOTE_PATTERN, "").trim() || null;
}

async function removeKeyboardIfPossible(
  callbackQuery: TelegramCallbackQuery,
): Promise<void> {
  if (!callbackQuery.message?.message_id) {
    return;
  }

  const chatId = callbackQuery.message.chat?.id;

  if (!chatId) {
    console.error("Failed to remove moderation keyboard: callback message chat is empty");
    return;
  }

  try {
    await removeMessageKeyboard(chatId, callbackQuery.message.message_id);
  } catch (error) {
    console.error("Failed to remove moderation keyboard");
    console.error(error);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
