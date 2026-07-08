import prisma from "@/app/prisma";
import { sendPostToModerationChannel } from "@/modules/moderation/telegram-moderation.client";

export async function sendPostToModeration(postId: string): Promise<void> {
  // Загружаем moderation вместе с post, чтобы повторно не отправить уже обработанный пост.
  const post = await prisma.post.findUnique({
    where: {
      id: postId,
    },
    include: {
      moderation: true,
    },
  });

  if (!post) {
    console.log(`Skip moderation: post ${postId} not found`);
    return;
  }

  if (post.status !== "COLLECTED" || post.moderation) {
    console.log(`Skip moderation: post ${post.id} is already processed`);
    return;
  }

  if (!post.text?.trim()) {
    // Первую версию модерации делаем только для текстовых постов.
    // Медиа без текста подключим отдельным шагом, когда добавим отправку фото/видео.
    console.log(`Skip moderation: post ${post.id} has no text`);
    return;
  }

  // Сначала отправляем сообщение во внешний Telegram API.
  // Это нельзя поместить в DB-транзакцию: Telegram-сообщение невозможно откатить вместе с БД.
  const draftMessageId = await sendPostToModerationChannel(post.id, post.text);

  // Если Telegram отправил сообщение успешно, одной транзакцией фиксируем два факта:
  // 1. У поста появилась запись модерации.
  // 2. Сам пост больше не должен попадать в выборку COLLECTED.
  await prisma.$transaction([
    prisma.postModeration.create({
      data: {
        postId: post.id,
        status: "SENT",
        draftMessageId: String(draftMessageId),
        sentAt: new Date(),
      },
    }),
    prisma.post.update({
      where: {
        id: post.id,
      },
      data: {
        status: "SENT_TO_MODERATION",
      },
    }),
  ]);

  console.log(`Post sent to moderation: ${post.id}`);
}
