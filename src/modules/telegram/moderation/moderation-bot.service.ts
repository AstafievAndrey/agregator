import prisma from "@/app/prisma";
import {
  answerCallbackQuery,
  getCallbackUpdates,
  removeMessageKeyboard,
  TelegramCallbackQuery,
} from "@/modules/telegram/moderation/moderation-bot.client";
import { enqueuePublication } from "@/modules/telegram/publication/publication.enqueue";

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
        offset = update.update_id + 1;

        if (!update.callback_query) {
          continue;
        }

        await handleModerationCallback(update.callback_query);
      }
    } catch (error) {
      console.error("Moderation bot polling failed");
      console.error(error);

      // Небольшая пауза защищает от бесконечного tight loop, если Telegram API временно недоступен.
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
    await removeKeyboardIfPossible(callbackQuery);
    await answerCallbackQuery(callbackQuery.id, "Пост уже обработан");
    return;
  }

  await prisma.$transaction([
    prisma.postModeration.update({
      where: {
        postId: post.id,
      },
      data: {
        status: "REJECTED",
        moderatedAt: new Date(),
      },
    }),
    prisma.post.update({
      where: {
        id: post.id,
      },
      data: {
        status: "REJECTED",
      },
    }),
  ]);

  await removeKeyboardIfPossible(callbackQuery);
  await answerCallbackQuery(callbackQuery.id, "Пост отклонен");
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
    await removeKeyboardIfPossible(callbackQuery);
    await answerCallbackQuery(callbackQuery.id, "Пост уже обработан");
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

  const draftText = getEditedDraftText(
    callbackQuery,
    moderation.draftText ?? post.text,
  );

  const publications = await prisma.$transaction(async (transaction) => {
    await transaction.postModeration.update({
      where: {
        postId: post.id,
      },
      data: {
        status: "APPROVED",
        draftText: draftText ?? moderation.draftText,
        moderatedAt: new Date(),
      },
    });

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
  await answerCallbackQuery(callbackQuery.id, "Пост отправлен на публикацию");
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
  // Если пользователь отредактировал сообщение в черновом канале,
  // Telegram пришлет актуальный text/caption в callback_query.message.
  const currentText = callbackQuery.message?.text ?? callbackQuery.message?.caption ?? null;

  if (!currentText?.trim()) {
    return null;
  }

  if (currentText.trim() === originalText?.trim()) {
    return null;
  }

  return currentText;
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
    // После обработки убираем кнопки, чтобы повторное нажатие было менее вероятно.
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
