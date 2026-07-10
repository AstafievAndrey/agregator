import prisma from "@/app/prisma";
import {
  telegramChannelsConfig,
  type TelegramDestinationConfig,
  type TelegramSourceConfig,
} from "./channels.config";

type TelegramSourceSeed = {
  id: string;
  name: string;
  channelName: string;
  metadata?: Record<string, string>;
};

type TelegramDestinationSeed = {
  id: string;
  name: string;
  channelId: string;
  channelName: string | null;
  metadata?: Record<string, string>;
  sources: TelegramSourceSeed[];
};

export async function seedTelegramSources(): Promise<void> {
  for (const source of telegramChannelsConfig.standaloneSources ?? []) {
    await upsertTelegramSource(normalizeTelegramSource(source));
  }

  for (const destinationConfig of telegramChannelsConfig.destinations) {
    const destination = normalizeTelegramDestination(destinationConfig);

    await upsertTelegramDestination(destination);

    for (const source of destination.sources) {
      await upsertTelegramSource(source);
      await linkSourceToDestination(source.id, destination.id);
    }
  }
}

function normalizeTelegramDestination(
  destination: TelegramDestinationConfig,
): TelegramDestinationSeed {
  const metadata = {
    ...(destination.footerText ? { footerText: destination.footerText } : {}),
    ...(destination.footerUrl ? { footerUrl: destination.footerUrl } : {}),
  };

  return {
    id: destination.id ?? createTelegramId(destination.channelName ?? destination.name),
    name: destination.name,
    channelId: destination.channelId,
    channelName: destination.channelName,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    sources: destination.sources.map(normalizeTelegramSource),
  };
}

function normalizeTelegramSource(source: TelegramSourceConfig): TelegramSourceSeed {
  const sourceConfig =
    typeof source === "string" ? { channelName: source } : source;

  return {
    id: sourceConfig.id ?? createTelegramId(sourceConfig.channelName),
    name: sourceConfig.name ?? sourceConfig.channelName,
    channelName: sourceConfig.channelName,
    metadata: sourceConfig.moderationChannelId
      ? { moderationChannelId: sourceConfig.moderationChannelId }
      : undefined,
  };
}

function createTelegramId(value: string): string {
  return `telegram_${value
    .trim()
    .replace(/^@/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
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
            metadata: source.metadata,
          },
          update: {
            channelName: source.channelName,
            metadata: source.metadata,
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
          metadata: source.metadata,
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
            metadata: destination.metadata,
          },
          update: {
            name: destination.name,
            channelId: destination.channelId,
            channelName: destination.channelName,
            metadata: destination.metadata,
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
          metadata: destination.metadata,
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
