import { startModerationWorker } from "@/modules/telegram/moderation/moderation.worker";

startModerationWorker();

console.log("Moderation worker started");
