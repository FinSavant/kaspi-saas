// Проверка подключения к Kaspi Merchant API по токену из .env.
// Запуск: npm run check:kaspi
// Печатает только количество заказов — без имён, адресов и телефонов покупателей.

import { isAwaitingHandover, KaspiApiError, KaspiClient } from '@kaspi/kaspi-client';

const token = process.env.KASPI_API_TOKEN;
if (!token) {
  console.error('Добавьте KASPI_API_TOKEN в файл .env');
  process.exit(1);
}

const from = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
const client = new KaspiClient(token);

try {
  const delivery = await client.listOrders({ state: 'KASPI_DELIVERY', from });
  const packing = delivery.filter((o) => !o.assembled && !o.courierTransmissionDate).length;
  const handover = delivery.filter(isAwaitingHandover).length;
  // У отменяемых заказов дата передачи тоже бывает заполнена, но накладной нет
  const handedOver = delivery.filter((o) => o.courierTransmissionDate && o.waybillUrl).length;

  console.log('Kaspi Доставка за 14 дней, как во вкладках кабинета:');
  console.log(`  Упаковка:             ${packing}`);
  console.log(`  Передача:             ${handover}   ← только эти идут в склейку накладных`);
  console.log(`  Переданы в доставку:  ${handedOver}`);
  const other = delivery.length - packing - handover - handedOver;
  if (other > 0) console.log(`  Прочие (отмены и т. п.): ${other}`);

  for (const state of ['NEW', 'PICKUP', 'DELIVERY', 'ARCHIVE']) {
    console.log(`${state.padEnd(10)} заказов за 14 дней: ${(await client.listOrders({ state, from })).length}`);
  }
  console.log('Подключение работает.');
} catch (error) {
  if (error instanceof KaspiApiError) {
    console.error(`Kaspi ответил ошибкой ${error.status}: ${error.body.slice(0, 300)}`);
  } else {
    console.error(error);
  }
  process.exit(1);
}
