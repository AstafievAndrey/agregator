import { enqueueActiveTelegramSources } from "@/modules/telegram/collector/telegram.enqueue";

const enqueueIntervalMs = 30_000;

export function startTelegramScheduler(): void {
  void enqueueSources();

  setInterval(() => {
    void enqueueSources();
  }, enqueueIntervalMs);
}

async function enqueueSources(): Promise<void> {
  try {
    console.log("Enqueue Telegram sources");

    await enqueueActiveTelegramSources({
      closeConnections: false,
    });
  } catch (error) {
    console.error("Failed to enqueue Telegram sources");
    console.error(error);
  }
}
