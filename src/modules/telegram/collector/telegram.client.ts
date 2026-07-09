import { TelegramClient } from "telegram";
import { LogLevel, Logger } from "telegram/extensions/Logger";
import { StringSession } from "telegram/sessions";
import env from "@/app/env";

export function createTelegramClient(): TelegramClient {
  if (!env.telegram.session) {
    throw new Error("TELEGRAM_SESSION is required. Run telegram login first.");
  }

  const client = new TelegramClient(
    new StringSession(env.telegram.session),
    env.telegram.apiId,
    env.telegram.apiHash,
    {
      baseLogger: new Logger(LogLevel.NONE),
      connectionRetries: 5,
      autoReconnect: false,
    },
  );

  client.setLogLevel(LogLevel.NONE);
  client._errorHandler = async (error: Error) => {
    if (error.message === "TIMEOUT") {
      return;
    }

    console.error("Telegram client internal error");
    console.error(error);
  };

  return client;
}
