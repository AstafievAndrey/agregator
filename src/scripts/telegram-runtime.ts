import { startTelegramScheduler } from "@/modules/telegram/collector/telegram.scheduler";
import { startTelegramWorker } from "@/modules/telegram/collector/telegram.worker";
import { startModerationBot } from "@/modules/moderation/moderation-bot.service";
import { startModerationScheduler } from "@/modules/moderation/moderation.scheduler";
import { startModerationWorker } from "@/modules/moderation/moderation.worker";
import { startPublicationScheduler } from "@/modules/publication/publication.scheduler";
import { startPublicationWorker } from "@/modules/publication/publication.worker";

// Один runtime поднимает три независимых конвейера:
// сбор постов, отправку в модерацию и публикацию одобренных материалов.
startTelegramWorker();
startTelegramScheduler();

startModerationWorker();
startModerationScheduler();

startPublicationWorker();
startPublicationScheduler();

void startModerationBot();

console.log("Telegram runtime started");
