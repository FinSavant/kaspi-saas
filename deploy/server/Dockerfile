# Один образ для всех сервисов на VPS: api, worker, bot (tsx из исходников) и web (собранный Next.js).
# Сервис выбирается командой в deploy/server/docker-compose.yml.
FROM node:24-slim

# Prisma нужен OpenSSL
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
COPY packages/kaspi-client/package.json packages/kaspi-client/
COPY packages/storage/package.json packages/storage/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/bot/package.json apps/bot/
COPY apps/web/package.json apps/web/
COPY packages/db/prisma packages/db/prisma
RUN npm ci

COPY . .
RUN npm run db:generate && NEXT_TELEMETRY_DISABLED=1 npm run build -w @kaspi/web

ENV NODE_ENV=production
