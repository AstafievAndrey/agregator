import { enqueueActiveTelegramSources } from "@/modules/telegram/collector/telegram.enqueue";
import env from "@/app/env";

export function startTelegramScheduler(): void {
  void enqueueSources();

  setInterval(() => {
    void enqueueSources();
  }, env.telegram.collectorIntervalMs);
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
