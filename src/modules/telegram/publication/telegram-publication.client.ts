import { openAsBlob } from "node:fs";
import env from "@/app/env";
import { DownloadedMediaFile } from "@/modules/telegram/moderation/moderation.service";

type SendPostToTelegramDestinationParams = {
  channelId: string;
  text: string | null;
  mediaFiles: DownloadedMediaFile[];
};

type TelegramMessageResult = {
  message_id: number;
};

type TelegramApiResponse<T> = {
  ok: boolean;
  description?: string;
  result?: T;
};

export async function sendPostToTelegramDestination(
  params: SendPostToTelegramDestinationParams,
): Promise<string> {
  assertPublicationEnv();

  if (params.mediaFiles.length === 0) {
    const message = await sendTextMessage(params);

    return String(message.message_id);
  }

  if (params.mediaFiles.length === 1) {
    const message = await sendSingleMediaMessage(params, params.mediaFiles[0]);

    return String(message.message_id);
  }

  const messages = await sendMediaAlbum(params);

  return messages.map((message) => message.message_id).join(",");
}

function assertPublicationEnv(): void {
  if (!env.telegram.botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is required");
  }
}

async function sendTextMessage(
  params: SendPostToTelegramDestinationParams,
): Promise<TelegramMessageResult> {
  return postJson<TelegramMessageResult>("sendMessage", {
    chat_id: params.channelId,
    text: params.text?.trim() || "Post without text",
  });
}

async function sendSingleMediaMessage(
  params: SendPostToTelegramDestinationParams,
  mediaFile: DownloadedMediaFile,
): Promise<TelegramMessageResult> {
  const formData = new FormData();
  const mediaFieldName = mediaFile.type === "PHOTO" ? "photo" : "video";
  const method = mediaFile.type === "PHOTO" ? "sendPhoto" : "sendVideo";

  formData.append("chat_id", params.channelId);
  formData.append(mediaFieldName, await createFileBlob(mediaFile), mediaFile.fileName);

  if (params.text?.trim()) {
    formData.append("caption", params.text);
  }

  return postFormData<TelegramMessageResult>(method, formData);
}

async function sendMediaAlbum(
  params: SendPostToTelegramDestinationParams,
): Promise<TelegramMessageResult[]> {
  const formData = new FormData();
  const media = [];

  formData.append("chat_id", params.channelId);

  for (const [index, mediaFile] of params.mediaFiles.entries()) {
    const fieldName = `file${index}`;
    const item: Record<string, string> = {
      type: mediaFile.type === "PHOTO" ? "photo" : "video",
      media: `attach://${fieldName}`,
    };

    if (index === 0 && params.text?.trim()) {
      item.caption = params.text;
    }

    formData.append(fieldName, await createFileBlob(mediaFile), mediaFile.fileName);
    media.push(item);
  }

  formData.append("media", JSON.stringify(media));

  return postFormData<TelegramMessageResult[]>("sendMediaGroup", formData);
}

async function createFileBlob(mediaFile: DownloadedMediaFile): Promise<Blob> {
  return openAsBlob(mediaFile.path, {
    type: mediaFile.mimeType,
  });
}

async function postJson<T>(method: string, body: unknown): Promise<T> {
  const response = await fetch(getBotApiUrl(method), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return parseTelegramResponse<T>(response, method);
}

async function postFormData<T>(method: string, formData: FormData): Promise<T> {
  const response = await fetch(getBotApiUrl(method), {
    method: "POST",
    body: formData,
  });

  return parseTelegramResponse<T>(response, method);
}

async function parseTelegramResponse<T>(response: Response, method: string): Promise<T> {
  const data = (await response.json()) as TelegramApiResponse<T>;

  if (!response.ok || !data.ok || data.result === undefined) {
    throw new Error(data.description ?? `Telegram Bot API ${method} failed`);
  }

  return data.result;
}

function getBotApiUrl(method: string): string {
  return `https://api.telegram.org/bot${env.telegram.botToken}/${method}`;
}
