// Читатель цен конкурентов для бота на сервере. Работает на компьютере продавца:
// раз в минуту берёт с сервера карточки с включённым ботом, читает цены продавцов
// с витрины Kaspi и отправляет их на сервер. Решения о цене и смена цены — на сервере.
// Запуск: start-price-reader.cmd (или npm run price-reader). Остановка — закрыть окно.
// В .env: SERVER_URL, SERVER_AUTH (логин:пароль кабинета на сервере), API_INTERNAL_KEY.

import { KaspiStorefrontPriceSource } from '@kaspi/kaspi-client';

const serverUrl = process.env.SERVER_URL?.replace(/\/$/, '');
const serverAuth = process.env.SERVER_AUTH;
const apiKey = process.env.API_INTERNAL_KEY;
if (!serverUrl || !serverAuth || !apiKey) {
  console.error('В .env должны быть заданы SERVER_URL, SERVER_AUTH и API_INTERNAL_KEY');
  process.exit(1);
}

const CYCLE_MS = 60_000;
const headers = {
  Authorization: `Basic ${Buffer.from(serverAuth).toString('base64')}`,
  'x-api-key': apiKey,
};
const storefront = new KaspiStorefrontPriceSource({ minIntervalMs: Number(process.env.STOREFRONT_MIN_INTERVAL_MS ?? 1_000) });
const time = () => new Date().toLocaleTimeString('ru-RU');

async function server<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${serverUrl}/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`сервер ответил ${res.status}`);
  return res.json() as Promise<T>;
}

console.log(`Читатель цен запущен, сервер ${serverUrl}. Окно не закрывайте.`);
for (;;) {
  const started = Date.now();
  try {
    const tasks = await server<{ masterSku: string; cityId: string; repricer: boolean }[]>('/reader/tasks');
    let sent = 0;
    let failed = 0;
    for (const task of tasks) {
      try {
        const offers = await storefront.getOffers(task);
        await server('/reader/offers', { ...task, offers });
        sent++;
      } catch (error) {
        failed++;
        console.warn(`${time()} карточка ${task.masterSku}: ${error instanceof Error ? error.message : error}`);
      }
    }
    console.log(`${time()} карточек прочитано: ${sent}${failed ? `, ошибок: ${failed}` : ''}`);
  } catch (error) {
    console.error(`${time()} нет связи с сервером: ${error instanceof Error ? error.message : error}`);
  }
  await new Promise((resolve) => setTimeout(resolve, Math.max(5_000, CYCLE_MS - (Date.now() - started))));
}
