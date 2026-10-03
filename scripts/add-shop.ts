// Добавляет магазин в локальную базу, пока в кабинете нет регистрации.
// Запуск: npm run add-shop -- <merchantId> "<название магазина>"
// Токен берётся из KASPI_API_TOKEN в .env и сохраняется зашифрованным.

import { encryptSecret } from '@kaspi/core';
import { prisma } from '@kaspi/db';

const [merchantId, name] = process.argv.slice(2);
const token = process.env.KASPI_API_TOKEN;
const key = process.env.TOKEN_ENCRYPTION_KEY;

if (!merchantId || !name) {
  console.error('Использование: npm run add-shop -- <merchantId> "<название магазина>"');
  process.exit(1);
}
if (!token || !key) {
  console.error('В .env должны быть заданы KASPI_API_TOKEN и TOKEN_ENCRYPTION_KEY');
  process.exit(1);
}

// Входа в кабинет пока нет, поэтому все локальные магазины принадлежат одному
// служебному пользователю, под которым войти нельзя
const owner = await prisma.user.upsert({
  where: { phone: 'local-owner' },
  create: { phone: 'local-owner', passwordHash: '!', name: 'Локальный владелец' },
  update: {},
});

const apiTokenEnc = encryptSecret(token, key);
const shop = await prisma.shop.upsert({
  where: { merchantId },
  create: {
    ownerId: owner.id,
    merchantId,
    name,
    apiTokenEnc,
    subscription: { create: { status: 'TRIAL', trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } },
  },
  update: { name, apiTokenEnc },
});

console.log(`Магазин «${shop.name}» (merchantId ${shop.merchantId}) сохранён. shopId: ${shop.id}`);
await prisma.$disconnect();
