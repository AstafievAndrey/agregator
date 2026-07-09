import prisma from "@/app/prisma";

type TelegramSourceSeed = {
  id: string;
  name: string;
  channelName: string;
};

type TelegramDestinationSeed = {
  id: string;
  name: string;
  channelId: string;
  channelName: string | null;
  sources: TelegramSourceSeed[];
};

const telegramDestinations: TelegramDestinationSeed[] = [
  {
    id: "telegram_milie_lapki",
    name: "Милые лапки",
    channelId: "-1003746675714",
    channelName: "milie_lapki",
    sources: [
      {
        id: "telegram_sobakech_sobaki",
        name: "Собакеч | Собаки",
        channelName: "sobakech_sobaki",
      },
      {
        id: "telegram_bezkotika",
        name: "Без кота и жизнь не та",
        channelName: "Bezkotika",
      },
      {
        id: "telegram_koshkii_kotiki",
        name: "шерстяные проказники - коты",
        channelName: "koshkii_kotiki",
      },
    ],
  },
  {
    id: "telegram_ugarniy_ceh",
    name: "Угарный цех",
    channelId: "-1003856108401",
    channelName: "ugarniy_ceh",
    sources: [
      {
        id: "telegram_memachh",
        name: "memachh",
        channelName: "memachh",
      },
      {
        id: "telegram_twitt_ota",
        name: "twitt_ota",
        channelName: "twitt_ota",
      },
      {
        id: "telegram_leoday",
        name: "leoday",
        channelName: "leoday",
      },
      {
        id: "telegram_why4ch",
        name: "why4ch",
        channelName: "why4ch",
      },
    ],
  },
];

export async function seedTelegramSources(): Promise<void> {
  await upsertTelegramSource({
    id: "telegram_test_channel_monit",
    name: "Тестовый ТГК",
    channelName: "test_channel_monit",
  });

  for (const destination of telegramDestinations) {
    await upsertTelegramDestination(destination);

    for (const source of destination.sources) {
      await upsertTelegramSource(source);
      await linkSourceToDestination(source.id, destination.id);
    }
  }
}

async function upsertTelegramSource(source: TelegramSourceSeed): Promise<void> {
  await prisma.source.upsert({
    where: {
      id: source.id,
    },
    update: {
      name: source.name,
      status: "ACTIVE",
      telegram: {
        upsert: {
          create: {
            channelName: source.channelName,
          },
          update: {
            channelName: source.channelName,
          },
        },
      },
    },
    create: {
      id: source.id,
      type: "TELEGRAM",
      name: source.name,
      status: "ACTIVE",
      telegram: {
        create: {
          channelName: source.channelName,
        },
      },
    },
  });
}

async function upsertTelegramDestination(
  destination: TelegramDestinationSeed,
): Promise<void> {
  await prisma.destination.upsert({
    where: {
      id: destination.id,
    },
    update: {
      name: destination.name,
      status: "ACTIVE",
      telegram: {
        upsert: {
          create: {
            name: destination.name,
            channelId: destination.channelId,
            channelName: destination.channelName,
          },
          update: {
            name: destination.name,
            channelId: destination.channelId,
            channelName: destination.channelName,
          },
        },
      },
    },
    create: {
      id: destination.id,
      type: "TELEGRAM",
      name: destination.name,
      status: "ACTIVE",
      telegram: {
        create: {
          name: destination.name,
          channelId: destination.channelId,
          channelName: destination.channelName,
        },
      },
    },
  });
}

async function linkSourceToDestination(
  sourceId: string,
  destinationId: string,
): Promise<void> {
  await prisma.sourceDestination.upsert({
    where: {
      sourceId_destinationId: {
        sourceId,
        destinationId,
      },
    },
    update: {},
    create: {
      sourceId,
      destinationId,
    },
  });
}
