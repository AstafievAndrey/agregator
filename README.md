# Agregator

Агрегатор Telegram-каналов с модерацией, очисткой текста через AI и публикацией в целевые каналы.

Стек: Node.js 22, TypeScript, Prisma 7, PostgreSQL 18, Redis, BullMQ, GramJS, Telegram Bot API.

## Первый запуск

Создать локальный файл окружения:

```bash
cp .env.example .env
```

Заполнить обязательные Telegram-переменные в `.env`:

```bash
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
TELEGRAM_SESSION=
TELEGRAM_BOT_TOKEN=
TELEGRAM_MODERATION_CHANNEL_ID=
```

Опциональные настройки Ollama. По умолчанию Docker-контейнер ожидает, что Ollama запущена на хостовой машине:

```bash
OLLAMA_ENABLED=true
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=qwen2.5:1.5b
OLLAMA_TIMEOUT_MS=60000
```

Собрать и запустить все контейнеры:

```bash
docker-compose up -d --build
```

Запустить миграции и seed каналов:

```bash
docker-compose exec app npm run prisma:migrate
docker-compose exec app npx tsx prisma/seed.ts
```

Если `TELEGRAM_SESSION` пустой, один раз выполнить логин и вставить полученную session-строку в `.env`:

```bash
docker-compose exec app npm run telegram:login
```

После изменения `.env` пересоздать runtime-контейнер:

```bash
docker-compose up -d --force-recreate telegram-runtime
```

## Что запускается

- `app`: служебный контейнер для Prisma, сборки, seed и разовых скриптов.
- `telegram-runtime`: основной процесс. Внутри него работают сбор постов, модерация, бот модерации и публикация.
- `postgres`: база данных, по умолчанию доступна на `localhost:5433`.
- `redis`: очереди, по умолчанию доступен на `localhost:6380`.

## Основные команды

Проверить контейнеры:

```bash
docker-compose ps
```

Смотреть логи runtime:

```bash
docker-compose logs -f --tail=200 telegram-runtime
```

Перезапустить только Telegram runtime:

```bash
docker-compose restart telegram-runtime
```

Перезапустить все контейнеры:

```bash
docker-compose restart
```

Пересобрать и перезапустить после изменений в коде:

```bash
docker-compose up -d --build
```

Удалить старые контейнеры, которых уже нет в `docker-compose.yml`:

```bash
docker-compose up -d --remove-orphans
```

Остановить контейнеры без удаления данных:

```bash
docker-compose down
```

Остановить контейнеры и удалить volumes PostgreSQL/Redis:

```bash
docker-compose down -v
```

## Команды для разработки

```bash
docker-compose exec app npm run build
docker-compose exec app npm run prisma:generate
docker-compose exec app npm run prisma:migrate
docker-compose exec app npx tsx prisma/seed.ts
```

В Windows PowerShell для локальных команд можно использовать `npm.cmd`, если обычный `npm` заблокирован execution policy:

```bash
npm.cmd run build
```

## Заметки

- На этой машине используется `docker-compose`, а не `docker compose`.
- После изменения каналов в `prisma/seeds/telegram-sources.seed.ts` нужно снова запустить `docker-compose exec app npx tsx prisma/seed.ts`.
- Если Ollama отвечает долго или недоступна, модерация использует локальную очистку текста, а задача продолжает выполняться.
- В канал модерации уходит уже очищенный текст. После подтверждения publication worker публикует пост в настроенные целевые каналы и добавляет подпись целевого канала в конец.
