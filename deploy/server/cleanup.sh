#!/usr/bin/env bash
# Автоуборка сервера (cron, раз в сутки). Тома Docker (база, redis, файлы, сертификаты) не трогает никогда.
set -uo pipefail
LOG=/var/log/kaspi-cleanup.log
{
  echo "=== $(date '+%F %T') ==="
  # Копии базы: три последние kaspi-*.dump; before-sanq-* не попадает под маску и остаётся
  ls -1t /opt/backups/kaspi-*.dump 2>/dev/null | tail -n +4 | xargs -r rm -fv --
  # Пустые/битые копии (неудачный pg_dump)
  find /opt/backups -name 'kaspi-*.dump' -size -100k -mtime +1 -print -delete
  rm -f /tmp/sanq-deploy.tgz
  # Docker: образы без тега, кэш сборки старше суток
  docker image prune -f
  docker builder prune -af --filter until=24h
  # Журнал systemd
  journalctl --vacuum-size=200M
  apt-get clean
  df -h /
} >> "$LOG" 2>&1
# Лог уборки не растёт бесконечно
tail -n 500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
