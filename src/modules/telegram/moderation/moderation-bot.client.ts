import env from "@/app/env";

export type TelegramCallbackMessage = {
  message_id: number;
  chat?: {
    id: number | string;
  };
  text?: string;
  caption?: string;
};

export type TelegramCallbackQuery = {
  id: string;
  data?: string;
  message?: TelegramCallbackMessage;
};

type TelegramUpdate = {
  update_id: number;
  callback_query?: TelegramCallbackQuery;
};

type TelegramApiResponse<T> = {
  ok: boolean;
  description?: string;
  result?: T;
};

export async function getCallbackUpdates(offset?: number): Promise<TelegramUpdate[]> {
  const body = {
    offset,
    timeout: 25,
    allowed_updates: ["callback_query"],
  };

  return postJson<TelegramUpdate[]>("getUpdates", body, 35_000);
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text: string,
): Promise<void> {
  await postJson<boolean>("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false,
  }, 5_000);
}

export async function removeMessageKeyboard(
  chatId: number | string,
  messageId: number,
): Promise<void> {
  await postJson<boolean>("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
  }, 10_000);
}

async function postJson<T>(
  method: string,
  body: unknown,
  timeoutMs = 15_000,
): Promise<T> {
  assertBotEnv();

  const response = await fetch(getBotApiUrl(method), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const data = (await response.json()) as TelegramApiResponse<T>;

  // Bot API может вернуть HTTP 200, но ok=false внутри JSON.
  // Поэтому проверяем и HTTP-статус, и тело ответа.
  if (!response.ok || !data.ok || data.result === undefined) {
    throw new Error(data.description ?? `Telegram Bot API ${method} failed`);
  }

  return data.result;
}

function assertBotEnv(): void {
  if (!env.telegram.botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is required");
  }
}

function getBotApiUrl(method: string): string {
  return `https://api.telegram.org/bot${env.telegram.botToken}/${method}`;
}
