import { mkdir, writeFile } from "node:fs/promises";
import { inspect } from "node:util";
import { createTelegramClient } from "@/modules/telegram/collector/telegram.client";

const channelName = "test_channel_monit";

const textOutputPath = "debug/telegram-messages.txt";
const jsonOutputPath = "debug/telegram-messages.json";

const client = createTelegramClient();

await client.connect();

try {
  const messages = await client.getMessages(channelName, {
    limit: 10,
  });

  const lines: string[] = [];

  lines.push(`Channel: ${channelName}`);
  lines.push(`Messages received: ${messages.length}`);
  lines.push("");

  for (const message of messages) {
    lines.push("=".repeat(100));
    lines.push(`id: ${message.id}`);
    lines.push(
      `date: ${message.date ? new Date(message.date * 1000).toISOString() : null}`,
    );
    lines.push(`text: ${message.message || null}`);
    lines.push(
      `groupedId: ${message.groupedId ? String(message.groupedId) : null}`,
    );
    lines.push(`has photo: ${Boolean(message.photo)}`);
    lines.push(`has video: ${Boolean(message.video)}`);
    lines.push(`media class: ${message.media?.className ?? null}`);
    lines.push("");
    lines.push("raw:");
    lines.push(
      inspect(message, {
        depth: 8,
        colors: false,
        compact: false,
      }),
    );
    lines.push("");
  }

  const json = {
    channelName,
    messagesReceived: messages.length,
    messages,
  };

  await mkdir("debug", { recursive: true });

  await writeFile(textOutputPath, lines.join("\n"), "utf-8");
  await writeFile(jsonOutputPath, stringifyJson(json), "utf-8");

  console.log(`Debug text file created: ${textOutputPath}`);
  console.log(`Debug json file created: ${jsonOutputPath}`);
} finally {
  await client.disconnect();
}

function stringifyJson(value: unknown): string {
  const seen = new WeakSet<object>();

  return JSON.stringify(
    value,
    (_key, currentValue) => {
      if (typeof currentValue === "bigint") {
        return currentValue.toString();
      }

      if (typeof currentValue === "function") {
        return undefined;
      }

      if (typeof currentValue === "object" && currentValue !== null) {
        if (seen.has(currentValue)) {
          return "[Circular]";
        }

        seen.add(currentValue);
      }

      return currentValue;
    },
    2,
  );
}
