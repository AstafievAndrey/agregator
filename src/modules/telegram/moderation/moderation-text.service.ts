import env from "@/app/env";
import { generateWithOllama } from "@/modules/ai/ollama.client";

type PreparePostTextContext = {
  sourceName?: string | null;
  sourceChannelName?: string | null;
};

export async function preparePostTextForModeration(
  text: string | null,
  context: PreparePostTextContext = {},
): Promise<string | null> {
  const originalText = text?.trim() || null;
  const sourceAliases = getSourceAliases(context);

  if (!originalText) {
    return null;
  }

  if (!env.ai.ollamaEnabled) {
    return cleanTextLocally(originalText, sourceAliases);
  }

  try {
    const processedText = cleanTextLocally(
      normalizeModelOutput(
        await generateWithOllama(createModerationTextPrompt(originalText, context)),
      ),
      sourceAliases,
    );

    return processedText || cleanTextLocally(originalText, sourceAliases);
  } catch (error) {
    console.error("Failed to process text with Ollama, using local cleanup");
    console.error(error);

    return cleanTextLocally(originalText, sourceAliases);
  }
}

function createModerationTextPrompt(
  text: string,
  context: PreparePostTextContext,
): string {
  const sourceAliases = getSourceAliases(context);
  const sourceRule =
    sourceAliases.length > 0
      ? `- Исходный канал/источник: ${sourceAliases.join(", ")}. Удали его название, username и любые строки-атрибуции/призывы перейти в этот канал.`
      : "- Удали названия внешних Telegram-каналов, если они используются как источник, подпись, рекламная вставка или остаток ссылки.";

  return [
    "Ты редактор Telegram-канала.",
    "Подготовь пост к публикации в черновой канал модерации.",
    "",
    "Главная задача: очистить исходный Telegram-пост от внешних ссылок, рекламы, названий каналов-источников и мусорных CTA, сохранив смысл.",
    "",
    "Правила:",
    "- Пиши на том же языке, что и исходный текст.",
    "- Полностью удали URL и домены: https://..., http://..., t.me/..., telegram.me/..., site.com/path.",
    "- Полностью удали Telegram-упоминания и названия каналов в формате @nameChannel, @channel_name, @name123.",
    sourceRule,
    "- Убери рекламные призывы, промокоды, саморекламу и приглашения подписаться.",
    "- Удали остаточные CTA-строки без смысла: 'Подробнее', 'Читать далее', 'Источник', 'Подписаться', 'Смотреть', 'Перейти', даже если рядом больше нет ссылки.",
    "- Если строка состояла только из эмодзи + CTA + ссылки/упоминания/названия канала, удали всю строку.",
    "- Сохрани факты, имена, цифры и смысл. Ничего не выдумывай.",
    "- Можно слегка перефразировать, чтобы текст звучал нейтрально и аккуратно.",
    "- Добавь 2-5 релевантных хештегов в конце.",
    "- Не добавляй пояснения, заголовки вроде 'Готовый текст' и markdown-обертки.",
    "- Верни только финальный текст поста.",
    "",
    "Исходный текст:",
    text,
  ].join("\n");
}

function cleanTextLocally(
  text: string | null,
  sourceAliases: string[] = [],
): string | null {
  const cleanedText = text
    ?.replace(/https?:\/\/\S+/gi, "")
    .replace(/\b(?:t\.me|telegram\.me)\/\S+/gi, "")
    .replace(/\b[a-z0-9-]+\.(?:ru|com|net|org|io|me|news|app|dev)\/\S*/gi, "")
    .replace(/@\w+/g, "")
    .replace(/^[^\p{L}\p{N}\n]*(?:подробнее|читать подробнее|читать далее|далее|источник|source|read more|more details)[^\p{L}\p{N}\n]*$/gimu, "")
    .replace(/^[^\p{L}\p{N}\n]*(?:подробности|детали|полная версия|полный текст|смотреть|смотрите|перейти|обсудить|комментарии)[^\p{L}\p{N}\n]*$/gimu, "")
    .replace(/^[^\p{L}\p{N}\n]*(?:жми|нажми|тапни|открыть|открывай|подписаться|подписывайся)[^\n]*$/gimu, "")
    .replace(/(?:подписывайтесь|подпишитесь|реклама|промокод|promo code|sponsored)[^\n]*/gi, "")
    .replace(/(?:подписывайся|рекламная интеграция|промо)[^\n]*/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .filter((line) => !isSourceAttributionLine(line, sourceAliases))
    .join("\n")
    .trim();

  return cleanedText || null;
}

function normalizeModelOutput(text: string): string {
  return text
    .replace(/^```(?:\w+)?/g, "")
    .replace(/```$/g, "")
    .replace(/^(?:готовый текст|финальный текст|пост):\s*/i, "")
    .trim();
}

function getSourceAliases(context: PreparePostTextContext): string[] {
  return [context.sourceName, context.sourceChannelName]
    .flatMap((value) => {
      const trimmedValue = value?.trim();

      if (!trimmedValue) {
        return [];
      }

      return [trimmedValue, trimmedValue.replace(/^@/, "")];
    })
    .filter((value, index, aliases) => value.length > 1 && aliases.indexOf(value) === index);
}

function isSourceAttributionLine(line: string, sourceAliases: string[]): boolean {
  const normalizedLine = normalizeForComparison(line);

  if (!normalizedLine || normalizedLine.length > 140) {
    return false;
  }

  return sourceAliases.some((alias) => {
    const normalizedAlias = normalizeForComparison(alias);

    return normalizedAlias.length > 1 && normalizedLine.includes(normalizedAlias);
  });
}

function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/@\w+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
