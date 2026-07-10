import { openAsBlob } from "node:fs";
import env from "@/app/env";

export type ModerationMediaFile = {
  type: "PHOTO" | "VIDEO";
  path: string;
  fileName: string;
  mimeType: string;
};

type SendPostToModerationChannelParams = {
  postId: string;
  chatId: string;
  text: string | null;
  mediaFiles: ModerationMediaFile[];
};

type TelegramInlineKeyboardButton = {
  text: string;
  callback_data: string;
};

type TelegramMessageResult = {
  message_id: number;
};

type TelegramApiResponse<T> = {
  ok: boolean;
  description?: string;
  result?: T;
};

export async function sendPostToModerationChannel(
  params: SendPostToModerationChannelParams,
): Promise<number> {
  assertModerationEnv();

  try {
    if (params.mediaFiles.length === 0) {
      return sendModerationTextMessage(params);
    }

    if (params.mediaFiles.length === 1) {
      return sendSingleMediaMessage(params, params.mediaFiles[0]);
    }

    return sendMediaAlbumWithControlMessage(params);
  } catch (error) {
    if (!isRequestTooLargeError(error)) {
      throw error;
    }

    console.warn("Moderation media request is too large, sending text-only draft");

    return sendModerationTextMessage({
      ...params,
      text: appendText(
        params.text,
        "[Служебно: медиа не отправлено в черновик из-за размера.]",
      ),
      mediaFiles: [],
    });
  }
}

function assertModerationEnv(): void {
  // Эти переменные нужны только модерации.
  // Поэтому проверяем их здесь, а не при старте всего приложения.
  if (!env.telegram.botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is required");
  }
}

async function sendModerationTextMessage(
  params: SendPostToModerationChannelParams,
): Promise<number> {
  const text = params.text?.trim() || "Пост без текста";

  const response = await postJson<TelegramMessageResult>("sendMessage", {
    chat_id: params.chatId,
    text,
    reply_markup: createModerationKeyboard(params.postId),
  });

  return response.message_id;
}

async function sendSingleMediaMessage(
  params: SendPostToModerationChannelParams,
  mediaFile: ModerationMediaFile,
): Promise<number> {
  const formData = new FormData();
  const mediaFieldName = mediaFile.type === "PHOTO" ? "photo" : "video";
  const method = mediaFile.type === "PHOTO" ? "sendPhoto" : "sendVideo";

  formData.append("chat_id", params.chatId);
  formData.append(mediaFieldName, await createFileBlob(mediaFile), mediaFile.fileName);

  if (params.text?.trim()) {
    formData.append("caption", params.text);
  }

  formData.append("reply_markup", JSON.stringify(createModerationKeyboard(params.postId)));

  const response = await postFormData<TelegramMessageResult>(method, formData);

  return response.message_id;
}

async function sendMediaAlbumWithControlMessage(
  params: SendPostToModerationChannelParams,
): Promise<number> {
  const formData = new FormData();
  const media = [];

  formData.append("chat_id", params.chatId);

  for (const [index, mediaFile] of params.mediaFiles.entries()) {
    const fieldName = `file${index}`;

    formData.append(fieldName, await createFileBlob(mediaFile), mediaFile.fileName);
    media.push({
      type: mediaFile.type === "PHOTO" ? "photo" : "video",
      media: `attach://${fieldName}`,
    });
  }

  formData.append("media", JSON.stringify(media));

  // Telegram Bot API не умеет вешать одну inline-клавиатуру на весь альбом.
  // Поэтому сначала отправляем альбом, а затем сообщение управления с кнопками.
  const albumMessages = await postFormData<TelegramMessageResult[]>(
    "sendMediaGroup",
    formData,
  );
  const firstAlbumMessageId = albumMessages[0]?.message_id;

  const controlMessage = await postJson<TelegramMessageResult>("sendMessage", {
    chat_id: params.chatId,
    text: getControlMessageText(params),
    reply_parameters: firstAlbumMessageId
      ? {
          message_id: firstAlbumMessageId,
        }
      : undefined,
    reply_markup: createModerationKeyboard(params.postId),
  });

  return controlMessage.message_id;
}

async function createFileBlob(mediaFile: ModerationMediaFile): Promise<Blob> {
  // openAsBlob позволяет передать файл в FormData без постоянного хранения в проекте.
  return openAsBlob(mediaFile.path, {
    type: mediaFile.mimeType,
  });
}

function getControlMessageText(params: SendPostToModerationChannelParams): string {
  const text = params.text?.trim();

  if (text) {
    return text;
  }

  return `Пост без текста. Вложений: ${params.mediaFiles.length}`;
}

function createModerationKeyboard(postId: string) {
  return {
    inline_keyboard: [
      [
        createCallbackButton("Опубликовать", `publish:${postId}`),
        createCallbackButton("Отклонить", `reject:${postId}`),
      ],
    ],
  };
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

async function postJson<T>(method: string, body: unknown): Promise<T> {
  const response = await fetch(getBotApiUrl(method), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return parseTelegramResponse<T>(response);
}

async function postFormData<T>(method: string, formData: FormData): Promise<T> {
  const response = await fetch(getBotApiUrl(method), {
    method: "POST",
    body: formData,
  });

  return parseTelegramResponse<T>(response);
}

async function parseTelegramResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as TelegramApiResponse<T>;

  // Bot API может вернуть HTTP 200, но ok=false внутри JSON.
  // Проверяем оба уровня, чтобы ошибка была видна в логах worker.
  if (!response.ok || !data.ok || !data.result) {
    throw new Error(data.description ?? "Telegram Bot API request failed");
  }

  return data.result;
}

function isRequestTooLargeError(error: unknown): boolean {
  return error instanceof Error && /request entity too large/i.test(error.message);
}

function appendText(text: string | null, suffix: string): string {
  const trimmedText = text?.trim();

  return trimmedText ? `${trimmedText}\n\n${suffix}` : suffix;
}

function getBotApiUrl(method: string): string {
  return `https://api.telegram.org/bot${env.telegram.botToken}/${method}`;
}
