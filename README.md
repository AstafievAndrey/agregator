# Agregator

Node.js 22 + TypeScript + Prisma 7 + PostgreSQL 18 starter running in Docker.

## Start

Create local environment file:

```bash
cp .env.example .env
```

Build and run containers:

```bash
docker compose up --build
```

After changing the Node.js base image, rebuild without cache:

```bash
docker compose build --no-cache app
docker compose up
```

Run migrations:

```bash
docker compose exec app npm run prisma:migrate
```

Open Prisma Studio:

```bash
docker compose exec app npm run prisma:studio
```

Then open `http://localhost:5555`.

## Services

- Prisma Studio: `http://localhost:5555`
- PostgreSQL: `localhost:5433`

## Useful Commands

```bash
docker compose exec app npm run build
docker compose exec app npm run prisma:generate
docker compose down
docker compose down -v
```
