import env from "@/app/env";

type TelegramInlineKeyboardButton = {
  text: string;
  callback_data: string;
};

type SendMessageResponse = {
  ok: boolean;
  description?: string;
  result?: {
    message_id: number;
  };
};

export async function sendPostToModerationChannel(
  postId: string,
  text: string,
): Promise<number> {
  // Эти переменные нужны только moderation worker, поэтому проверяем их здесь,
  // а не в общем env.ts. Так collector и Prisma-команды могут работать без бота.
  if (!env.telegram.botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is required");
  }

  if (!env.telegram.moderationChannelId) {
    throw new Error("TELEGRAM_MODERATION_CHANNEL_ID is required");
  }

  // Пока используем прямой Telegram Bot API через fetch.
  // Для первой версии этого достаточно: отправить текст и две inline-кнопки.
  const response = await fetch(
    `https://api.telegram.org/bot${env.telegram.botToken}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: env.telegram.moderationChannelId,
        text,
        reply_markup: {
          inline_keyboard: [
            [
              // В callback_data кладем postId, чтобы будущий bot handler понял,
              // какой именно пост нужно опубликовать или отклонить.
              createCallbackButton("Опубликовать", `publish:${postId}`),
              createCallbackButton("Отклонить", `reject:${postId}`),
            ],
          ],
        },
      }),
    },
  );

  const data = (await response.json()) as SendMessageResponse;

  // Telegram Bot API может вернуть HTTP 200, но ok=false внутри JSON.
  // Проверяем оба признака, чтобы ошибка не потерялась.
  if (!response.ok || !data.ok || !data.result) {
    throw new Error(data.description ?? "Failed to send moderation message");
  }

  // message_id сохраняем в PostModeration, чтобы связать запись в БД с сообщением в черновом канале.
  return data.result.message_id;
}

function createCallbackButton(
  text: string,
  callbackData: string,
): TelegramInlineKeyboardButton {
  return {
    text,
    callback_data: callbackData,
  };
}
