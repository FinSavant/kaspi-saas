#!/usr/bin/env bash
# Установка службы sanq-price-reader на Ubuntu 24.04. Запуск от root:
#   sudo bash deploy/price-reader/install.sh [/opt/kaspi-saas]
# Скрипт НЕ запускает службу: сначала заполните /etc/sanq/price-reader.env,
# потом systemctl enable --now sanq-price-reader.
set -euo pipefail

APP_DIR="${1:-/opt/kaspi-saas}"
ENV_FILE=/etc/sanq/price-reader.env
UNIT_SRC="$APP_DIR/deploy/price-reader/sanq-price-reader.service"

[ "$(id -u)" -eq 0 ] || { echo "Запустите от root (sudo)"; exit 1; }
[ -f "$UNIT_SRC" ] || { echo "Нет $UNIT_SRC"; exit 1; }
command -v node >/dev/null || { echo "Нужен Node.js 22+ (/usr/bin/node)"; exit 1; }
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ] || { echo "Нужен Node.js 22+"; exit 1; }
[ "$(command -v node)" = /usr/bin/node ] || echo "Внимание: node не в /usr/bin/node, поправьте ExecStart в unit-файле"
[ -x "$APP_DIR/node_modules/.bin/tsx" ] || { echo "Нет $APP_DIR/node_modules. Выполните там: npm ci"; exit 1; }

id sanq-reader >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin sanq-reader

install -d -m 755 /etc/sanq
if [ ! -f "$ENV_FILE" ]; then
  install -m 600 -o root -g root "$APP_DIR/deploy/price-reader/price-reader.env.example" "$ENV_FILE"
  echo "Создан $ENV_FILE из шаблона. Заполните его (nano $ENV_FILE)."
fi
# Читает root при старте службы, пользователю sanq-reader файл не нужен
chown root:root "$ENV_FILE"
chmod 600 "$ENV_FILE"

sed "s#/opt/kaspi-saas#$APP_DIR#g" "$UNIT_SRC" > /etc/systemd/system/sanq-price-reader.service
systemctl daemon-reload
systemctl enable sanq-price-reader >/dev/null
echo "Готово. Служба включена в автозапуск, но НЕ запущена."
echo "Дальше: заполнить $ENV_FILE, затем systemctl start sanq-price-reader"
echo "Журнал: journalctl -u sanq-price-reader -f"
