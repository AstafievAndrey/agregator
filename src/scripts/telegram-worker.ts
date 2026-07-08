import { startTelegramWorker } from "@/modules/telegram/collector/telegram.worker";

startTelegramWorker();

console.log("Telegram worker started");
