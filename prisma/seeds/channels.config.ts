export type TelegramSourceConfig =
  | string
  | {
      id?: string;
      name?: string;
      channelName: string;
      moderationChannelId?: string;
    };

export type TelegramDestinationConfig = {
  id?: string;
  name: string;
  channelId: string;
  channelName: string | null;
  footerText?: string;
  footerUrl?: string;
  sources: TelegramSourceConfig[];
};

export type TelegramChannelsConfig = {
  standaloneSources?: TelegramSourceConfig[];
  destinations: TelegramDestinationConfig[];
};

// Это единственное место, где вручную описываются связи:
// источник Telegram -> канал назначения и, при необходимости, отдельный черновик.
export const telegramChannelsConfig: TelegramChannelsConfig = {
  standaloneSources: [
    {
      id: "telegram_test_channel_monit",
      name: "Тестовый ТГК",
      channelName: "test_channel_monit",
    },
  ],
  destinations: [
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
        { channelName: "memachh" },
        { channelName: "twitt_ota" },
        { channelName: "leoday" },
        { channelName: "why4ch" },
      ],
    },
    {
      id: "telegram_realbrainrotdaily",
      name: "Real Brain Rot Daily",
      channelId: "-1004460851552",
      channelName: "realbrainrotdaily",
      sources: [
        { channelName: "thememetimes" },
        { channelName: "funnyvideos" },
        { channelName: "memeburst9" },
        { channelName: "guffawbox" },
        { channelName: "laughquake_und" },
      ],
    },
  ],
};
