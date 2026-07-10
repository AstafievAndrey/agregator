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

  const locallyCleanedText = cleanTextLocally(originalText, sourceAliases);

  if (!env.ai.ollamaEnabled) {
    return locallyCleanedText;
  }

  try {
    const modelText = normalizeModelOutput(
      await generateWithOllama(createModerationTextPrompt(originalText, context)),
    );
    const processedText = cleanTextLocally(modelText, sourceAliases);

    if (!processedText || isUnsafeModelRewrite(originalText, processedText)) {
      console.warn("Ollama response looked unsafe, using local cleanup");

      return locallyCleanedText;
    }

    return processedText;
  } catch (error) {
    console.error("Failed to process text with Ollama, using local cleanup");
    console.error(error);

    return locallyCleanedText;
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
    "Твоя задача - удалить рекламу, внешние ссылки и мусорные подписи из исходного поста.",
    "Это НЕ генерация нового текста. Это только чистка уже готового текста.",
    "",
    "Жесткие правила:",
    "- Работай только с исходным текстом ниже.",
    "- Нельзя добавлять новые факты, примеры, объяснения, списки, размеры, цифры, мнения или детали, которых нет в исходнике.",
    "- Нельзя отвечать на вопросы из исходного текста. Если исходник вопрос, верни этот вопрос после очистки рекламы и ссылок.",
    "- Нельзя превращать короткую подпись в статью. Если исходник короткий, ответ тоже короткий.",
    "- Сохрани смысл и формулировку исходного текста настолько близко, насколько возможно.",
    "- Перефразируй только если это нужно, чтобы убрать рекламный хвост или остаток ссылки.",
    "- Полностью удали URL и домены: https://..., http://..., t.me/..., telegram.me/..., site.com/path.",
    "- Удали markdown-ссылки вместе с текстом ссылки, если они ведут на внешний Telegram-канал.",
    "- Удали Telegram-упоминания и названия каналов в формате @nameChannel, @channel_name, @name123.",
    sourceRule,
    "- Убери рекламные призывы, промокоды, саморекламу и приглашения подписаться.",
    "- Удали остаточные CTA-строки без смысла: 'Подробнее', 'Читать далее', 'Источник', 'Подписаться', 'Смотреть', 'Перейти'.",
    "- Если нормального текста нет, верни пустую строку.",
    "- Верни только финальный текст поста без пояснений, заголовков и markdown-оберток.",
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
    ?.replace(/\[[^\]]{1,80}\]\((?:https?:\/\/)?(?:t\.me|telegram\.me)\/[^)]+\)/gi, "")
    .replace(/\[[^\]]{1,80}\]\(https?:\/\/[^)]+\)/gi, "")
    .replace(/\(\s*(?:https?:\/\/)?(?:t\.me|telegram\.me)\/[^)\s]+\s*\)/gi, "")
    .replace(/\(\s*https?:\/\/[^)\s]+\s*\)/gi, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\b(?:t\.me|telegram\.me)\/\S+/gi, "")
    .replace(/\b[a-z0-9-]+\.(?:ru|com|net|org|io|me|news|app|dev)\/\S*/gi, "")
    .replace(/@\w+/g, "")
    .replace(/^[^\p{L}\p{N}\n]*(?:подробнее|читать подробнее|читать далее|далее|источник|source|read more|more details)[^\p{L}\p{N}\n]*$/gimu, "")
    .replace(/^[^\p{L}\p{N}\n]*(?:подробности|детали|полная версия|полный текст|смотреть|смотрите|перейти|обсудить|комментарии)[^\p{L}\p{N}\n]*$/gimu, "")
    .replace(/^[^\p{L}\p{N}\n]*(?:жми|нажми|тапни|открыть|открывай|подписаться|подписывайся)[^\n]*$/gimu, "")
    .replace(/(?:подписывайтесь|подпишитесь|реклама|промокод|promo code|sponsored)[^\n]*/gi, "")
    .replace(/(?:подписывайся|рекламная интеграция|промо)[^\n]*/gi, "")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\[\s*\]/g, "")
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

function isUnsafeModelRewrite(originalText: string, processedText: string): boolean {
  const originalWithoutLinks = cleanTextLocally(originalText) ?? originalText.trim();
  const processedWithoutTags = processedText
    .replace(/#[\p{L}\p{N}_-]+/gu, "")
    .trim();

  if (!processedWithoutTags) {
    return false;
  }

  if (/^\s*\d+\.\s/m.test(processedWithoutTags)) {
    return true;
  }

  if (/^\d+$/.test(processedWithoutTags) && /\p{L}/u.test(originalWithoutLinks)) {
    return true;
  }

  if (
    originalWithoutLinks.split(/\s+/).length >= 3 &&
    processedWithoutTags.split(/\s+/).length <= 1
  ) {
    return true;
  }

  if (/(интересн(?:ые|ых) факт|ниже представлены|вот несколько|например)/iu.test(processedWithoutTags)) {
    return true;
  }

  const originalLength = Math.max(originalWithoutLinks.length, 1);

  if (originalLength < 160 && processedWithoutTags.length > originalLength * 2.2) {
    return true;
  }

  return processedWithoutTags.split(/\s+/).length > originalWithoutLinks.split(/\s+/).length + 45;
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
