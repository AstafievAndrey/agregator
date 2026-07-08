import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import env from "@/app/env";

export function createTelegramClient(): TelegramClient {
  if (!env.telegram.session) {
    throw new Error("TELEGRAM_SESSION is required. Run telegram login first.");
  }

  return new TelegramClient(
    new StringSession(env.telegram.session),
    env.telegram.apiId,
    env.telegram.apiHash,
    {
      connectionRetries: 5,
      autoReconnect: false,
    },
  );
}
