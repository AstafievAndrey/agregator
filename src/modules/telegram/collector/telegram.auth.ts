import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import env from "@/app/env";

export async function loginTelegram(): Promise<string> {
  const readline = createInterface({ input, output });

  const session = new StringSession(env.telegram.session);

  const client = new TelegramClient(
    session,
    env.telegram.apiId,
    env.telegram.apiHash,
    {
      connectionRetries: 5,
    },
  );

  try {
    await client.start({
      phoneNumber: async () => readline.question("Phone number: "),
      phoneCode: async () => readline.question("Telegram code: "),
      password: async () => readline.question("2FA password, if enabled: "),
      onError: (error) => {
        console.error(error);
      },
    });

    return session.save();
  } finally {
    await client.disconnect();
    readline.close();
  }
}
