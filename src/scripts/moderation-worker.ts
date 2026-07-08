import { startModerationWorker } from "@/modules/moderation/moderation.worker";

startModerationWorker();

console.log("Moderation worker started");
