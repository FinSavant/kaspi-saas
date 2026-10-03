#!/usr/bin/env bash
# Сборка и запуск (или обновление) Kaspi SaaS на VPS. Воркер не трогает:
# он меняет цены в Kaspi и запускается отдельно — deploy/server/worker.sh.
set -euo pipefail
cd /opt/kaspi-saas
COMPOSE=(docker compose --env-file .env.server -f deploy/server/docker-compose.yml)

"${COMPOSE[@]}" build migrate
"${COMPOSE[@]}" up -d postgres redis migrate api web caddy
# Если воркер уже работает — перезапустить его на новом коде
if [ -n "$("${COMPOSE[@]}" --profile worker ps -q worker 2>/dev/null)" ]; then
  "${COMPOSE[@]}" --profile worker up -d worker
fi
if [ -n "$("${COMPOSE[@]}" --profile bot ps -q bot 2>/dev/null)" ]; then
  "${COMPOSE[@]}" --profile bot up -d bot
fi
"${COMPOSE[@]}" ps
