import { enqueueCollectedPostsForModeration } from "@/modules/telegram/moderation/moderation.enqueue";
import env from "@/app/env";

export function startModerationScheduler(): void {
  // Первый запуск делаем сразу, чтобы не ждать 30 секунд после старта контейнера.
  void enqueuePosts();

  // Потом периодически проверяем, появились ли новые COLLECTED-посты.
  setInterval(() => {
    void enqueuePosts();
  }, env.telegram.moderationIntervalMs);
}

async function enqueuePosts(): Promise<void> {
  try {
    console.log("Enqueue posts for moderation");

    await enqueueCollectedPostsForModeration({
      closeConnections: false,
    });
  } catch (error) {
    console.error("Failed to enqueue posts for moderation");
    console.error(error);
  }
}
