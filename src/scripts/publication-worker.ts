import { startPublicationWorker } from "@/modules/telegram/publication/publication.worker";

startPublicationWorker();

console.log("Publication worker started");
