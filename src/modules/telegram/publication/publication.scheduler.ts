import { enqueuePendingPublications } from "@/modules/telegram/publication/publication.enqueue";
import env from "@/app/env";

export function startPublicationScheduler(): void {
  // Scheduler подбирает публикации, которые могли остаться в PENDING после перезапуска.
  void enqueuePublications();

  setInterval(() => {
    void enqueuePublications();
  }, env.telegram.publicationIntervalMs);
}

async function enqueuePublications(): Promise<void> {
  try {
    console.log("Enqueue pending publications");

    await enqueuePendingPublications({
      closeConnections: false,
    });
  } catch (error) {
    console.error("Failed to enqueue pending publications");
    console.error(error);
  }
}
