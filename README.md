# Agregator

Агрегатор Telegram-каналов с модерацией, очисткой текста через Ollama и публикацией в целевые каналы.

Стек: Node.js 22, TypeScript, Prisma 7, PostgreSQL 18, Redis, BullMQ, GramJS, Telegram Bot API.

## Что Запускается

- `postgres` - база данных.
- `redis` - очереди BullMQ.
- `app` - служебный контейнер для Prisma, seed, build и разовых команд.
- `telegram-runtime` - основной процесс: сбор постов, отправка в модерацию, bot callbacks, публикация.

На этой машине используется `docker-compose`, не `docker compose`.

## Первый Запуск

Создать `.env`:

```bash
cp .env.example .env
```

Заполнить обязательные переменные:

```bash
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
TELEGRAM_SESSION=
TELEGRAM_BOT_TOKEN=
TELEGRAM_MODERATION_CHANNEL_ID=
```

Если `TELEGRAM_SESSION` ещё нет, сначала поднять контейнеры и выполнить логин:

```bash
docker-compose up -d --build
docker-compose exec app npm run telegram:login
```

Полученную session-строку вставить в `.env`.

Настройки Ollama опциональны. По умолчанию контейнер ходит в Ollama на хосте:

```bash
OLLAMA_ENABLED=true
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=qwen2.5:1.5b
OLLAMA_TIMEOUT_MS=60000
```

Применить миграции и seed:

```bash
docker-compose exec app npx prisma migrate deploy
docker-compose exec app npx tsx prisma/seed.ts
```

## Обычный Запуск

Запустить всё:

```bash
docker-compose up -d
```

Запустить с пересборкой образов:

```bash
docker-compose up -d --build
```

Проверить контейнеры:

```bash
docker-compose ps
```

Смотреть логи runtime:

```bash
docker-compose logs -f --tail=200 telegram-runtime
```

## Перезапуск

Перезапустить только основной Telegram runtime:

```bash
docker-compose restart telegram-runtime
```

Перезапустить всё:

```bash
docker-compose restart
```

После изменения `.env` лучше пересоздать runtime:

```bash
docker-compose up -d --force-recreate telegram-runtime
```

После изменения Dockerfile, зависимостей или `docker-compose.yml`:

```bash
docker-compose up -d --build
```

Убрать старые контейнеры, которых уже нет в `docker-compose.yml`:

```bash
docker-compose up -d --remove-orphans
```

## Каналы И Seed

Каналы, источники и связи source -> destination настраиваются здесь:

```text
prisma/seeds/channels.config.ts
```

После изменения конфига каналов применить seed:

```bash
docker-compose exec app npx tsx prisma/seed.ts
```

Если добавлялись новые поля в Prisma-схему, сначала применить миграции:

```bash
docker-compose exec app npx prisma migrate deploy
docker-compose exec app npx tsx prisma/seed.ts
```

Для source можно указать отдельный черновик модерации:

```ts
{
  name: "Угарный источник",
  channelName: "source_channel",
  moderationChannelId: "-1001234567890",
}
```

Если `moderationChannelId` не указан, используется дефолтный черновик из `.env`:

```bash
TELEGRAM_MODERATION_CHANNEL_ID=
```

## Диагностика

Общий статус БД и очередей:

```bash
docker-compose exec app npm run status
```

Ошибки, failed-задачи и отклонённые посты:

```bash
docker-compose exec app npm run status:failed
```

Проверить TypeScript-сборку:

```bash
docker-compose exec app npm run build
```

Локально в PowerShell, если `npm` заблокирован execution policy:

```bash
npm.cmd run build
```

## Остановка

Остановить контейнеры без удаления данных:

```bash
docker-compose down
```

Остановить контейнеры и удалить volumes PostgreSQL/Redis:

```bash
docker-compose down -v
```

`down -v` удаляет данные БД и Redis. Использовать только если точно нужно начать с чистого состояния.
