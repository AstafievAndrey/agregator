import { startTelegramScheduler } from "@/modules/telegram/collector/telegram.scheduler";
import { startTelegramWorker } from "@/modules/telegram/collector/telegram.worker";
import { startModerationBot } from "@/modules/telegram/moderation/moderation-bot.service";
import { startModerationScheduler } from "@/modules/telegram/moderation/moderation.scheduler";
import { startModerationWorker } from "@/modules/telegram/moderation/moderation.worker";
import { startPublicationScheduler } from "@/modules/telegram/publication/publication.scheduler";
import { startPublicationWorker } from "@/modules/telegram/publication/publication.worker";

startTelegramWorker();
startTelegramScheduler();

startModerationWorker();
startModerationScheduler();

startPublicationWorker();
startPublicationScheduler();

void startModerationBot();

console.log("Telegram runtime started");
