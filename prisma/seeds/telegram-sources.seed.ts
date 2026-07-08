import prisma from "@/app/prisma";

export async function seedTelegramSources(): Promise<void> {
  await prisma.source.upsert({
    where: {
      id: "telegram_test_channel_monit",
    },
    update: {
      name: "Тестовый ТГК",
      status: "ACTIVE",
      telegram: {
        upsert: {
          create: {
            channelName: "test_channel_monit",
          },
          update: {
            channelName: "test_channel_monit",
          },
        },
      },
    },
    create: {
      id: "telegram_test_channel_monit",
      type: "TELEGRAM",
      name: "Тестовый ТГК",
      status: "ACTIVE",
      telegram: {
        create: {
          channelName: "test_channel_monit",
        },
      },
    },
  });
}
