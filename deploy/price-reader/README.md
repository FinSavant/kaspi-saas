# Price Reader на Ubuntu 24.04 (systemd)

Читатель цен (`scripts/price-reader.ts`) берёт с сервера SANQ список карточек, читает цены продавцов
с витрины Kaspi и отправляет их на сервер. Решения о цене принимает сервер (`COMPETITOR_SOURCE=remote`).
Механизм запросов к Kaspi не менялся. Прокси, VPN и обхода ограничений нет и быть не должно.

## Важно до установки
Витрина Kaspi может отвечать **405** с адресов дата-центров (с IP VPS так и было). Тогда на VPS читатель
сам приостановится и, если блокировка держится, остановится. Читать цены продолжит компьютер владельца.
**Два читателя одновременно запускать не нужно**: они дублируют запросы к Kaspi.

## Установка (после разрешения владельца)
1. Нужны Node.js 22+ (`/usr/bin/node`) и `npm ci` в `/opt/kaspi-saas`.
2. `sudo bash /opt/kaspi-saas/deploy/price-reader/install.sh`
   Создаёт пользователя `sanq-reader`, файл `/etc/sanq/price-reader.env` (root, 600) и службу. Службу не запускает.
3. `sudo nano /etc/sanq/price-reader.env`, заполнить `SERVER_URL`, `SERVER_AUTH`, `API_INTERNAL_KEY`.
4. `sudo systemctl start sanq-price-reader` (автозапуск при загрузке уже включён).

## Управление
- Статус: `systemctl status sanq-price-reader`
- Журнал: `journalctl -u sanq-price-reader -f` (за час: `--since "1 hour ago"`)
- Стоп: `sudo systemctl stop sanq-price-reader`
- После правки env: `sudo systemctl restart sanq-price-reader`

## Что происходит при сбоях
- **Падение процесса**: перезапуск через 10 с. Больше 5 запусков за 10 минут — systemd перестаёт пробовать.
- **Kaspi ответил 405 или 429**: цикл прерывается на первой карточке, остальные не запрашиваются.
  Пауза 5, 10, 20, 40, потом 60 минут. Один успешный цикл сбрасывает счётчик.
- **405 шесть циклов подряд** (около 3 часов): опрос останавливается, в журнале сообщение уровня error,
  код выхода 78, systemd не перезапускает. Запуск вручную: `systemctl start sanq-price-reader`.
- **Нет связи с сервером SANQ**: повтор с паузой 1, 2, 4... до 15 минут.
- Пока читатель не работает, сервер видит, что цены не приходят, и робот цен их не меняет.

## Откат
`sudo systemctl disable --now sanq-price-reader && sudo rm /etc/systemd/system/sanq-price-reader.service && sudo systemctl daemon-reload`
