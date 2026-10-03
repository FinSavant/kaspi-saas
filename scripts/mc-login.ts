// Вход в кабинет продавца Kaspi для синхронизации товаров.
// Запуск: npm run mc:login
// Логин и пароль берутся из KASPI_MC_LOGIN и KASPI_MC_PASSWORD в .env.
// Если Kaspi пришлёт код на почту, его нужно ввести здесь же.
// Сессия сохраняется в базе зашифрованной; устройство запоминается.

import { createInterface } from 'node:readline/promises';
import { encryptSecret } from '@kaspi/core';
import { prisma } from '@kaspi/db';
import { KaspiCabinetClient } from '@kaspi/kaspi-client';

const login = process.env.KASPI_MC_LOGIN;
const password = process.env.KASPI_MC_PASSWORD;
const key = process.env.TOKEN_ENCRYPTION_KEY;
if (!login || !password || !key) {
  console.error('В .env должны быть заданы KASPI_MC_LOGIN, KASPI_MC_PASSWORD и TOKEN_ENCRYPTION_KEY');
  process.exit(1);
}

const merchantId = process.argv[2];
const shop = merchantId
  ? await prisma.shop.findUnique({ where: { merchantId } })
  : await prisma.shop.findFirst({ orderBy: { createdAt: 'asc' } });
if (!shop) {
  console.error('Магазин не найден. Сначала добавьте его: npm run add-shop');
  process.exit(1);
}

const client = new KaspiCabinetClient();
const saveSession = () =>
  prisma.shop.update({ where: { id: shop.id }, data: { mcSessionEnc: encryptSecret(client.jar.toJSON(), key) } });

try {
  let result = await client.login(login, password, shop.merchantId);
  if (result.status === 'MFA_REQUIRED') {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const code = (await rl.question(`Kaspi отправил код на ${result.email}. Введите код: `)).trim();
    rl.close();
    result = await client.submitMfaCode(code, result.email, shop.merchantId);
  }
  if (result.status !== 'OK') throw new Error('Kaspi снова запросил код. Попробуйте ещё раз позже.');
  // Сохраняем сразу: в куках и «запомненное устройство», чтобы код не спрашивали снова
  await saveSession();

  // Проверяем, что сессия действительно даёт доступ к товарам
  const offers = await client.listActiveOffers(shop.merchantId);
  await saveSession();
  console.log(`Вход выполнен. Магазин «${shop.name}»: товаров в продаже — ${offers.length}.`);
} catch (error) {
  console.error('Не удалось войти:', error instanceof Error ? error.message : error);
  // Только адреса и коды ответов — без параметров, кук и данных
  console.error('Шаги входа:\n  ' + client.trace.join('\n  '));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
