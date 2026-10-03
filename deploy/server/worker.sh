#!/usr/bin/env bash
# Запуск воркера (демпинг-бот, загрузка заказов и товаров, склейка накладных) на VPS.
# Перед первым запуском остановите воркер на компьютере, иначе цены будут меняться дважды.
set -euo pipefail
cd /opt/kaspi-saas
docker compose --env-file .env.server -f deploy/server/docker-compose.yml --profile worker up -d worker
sleep 15
docker compose --env-file .env.server -f deploy/server/docker-compose.yml --profile worker logs --tail 20 worker
