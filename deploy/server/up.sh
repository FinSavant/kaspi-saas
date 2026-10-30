#!/usr/bin/env bash
# Сборка и запуск (или обновление) Kaspi SaaS на VPS. Воркер не трогает:
# он меняет цены в Kaspi и запускается отдельно — deploy/server/worker.sh.
set -euo pipefail
cd /opt/kaspi-saas
COMPOSE=(docker compose --env-file .env.server -f deploy/server/docker-compose.yml)

"${COMPOSE[@]}" build migrate
"${COMPOSE[@]}" up -d postgres redis migrate api web caddy
# Caddyfile смонтирован файлом: после распаковки нового кода Caddy видит старую копию,
# поэтому его перезапускаем (сертификаты хранятся в томе caddydata и не теряются)
"${COMPOSE[@]}" restart caddy
# Если воркер уже работает — перезапустить его на новом коде
if [ -n "$("${COMPOSE[@]}" --profile worker ps -q worker 2>/dev/null)" ]; then
  "${COMPOSE[@]}" --profile worker up -d worker
fi
if [ -n "$("${COMPOSE[@]}" --profile bot ps -q bot 2>/dev/null)" ]; then
  "${COMPOSE[@]}" --profile bot up -d bot
fi
"${COMPOSE[@]}" ps

# Уборка после выкладки. Тома (база, файлы, сертификаты) не трогаем никогда.
echo '--- Уборка ---'
docker image prune -f || true
# Кэш сборки старше суток; свежий остаётся, чтобы следующая сборка шла быстро
docker builder prune -af --filter until=24h || true
# Копии базы: три последние плюс копия перед запуском SANQ (before-sanq-*)
ls -1t /opt/backups/kaspi-*.dump 2>/dev/null | tail -n +4 | xargs -r rm -f --
rm -f /tmp/sanq-deploy.tgz
journalctl --vacuum-size=200M || true
docker system df
ls -la /opt/backups
df -h /
