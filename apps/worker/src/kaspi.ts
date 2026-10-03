import { decryptSecret, encryptSecret } from '@kaspi/core';
import { prisma } from '@kaspi/db';
import { CookieJar, KaspiCabinetAuthError, KaspiCabinetClient, KaspiClient } from '@kaspi/kaspi-client';

function encryptionKey(): string {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error('TOKEN_ENCRYPTION_KEY is required');
  return key;
}

export function kaspiClientForShop(shop: { apiTokenEnc: string }): KaspiClient {
  return new KaspiClient(decryptSecret(shop.apiTokenEnc, encryptionKey()));
}

export class CabinetLoginRequiredError extends Error {
  constructor(reason: string) {
    super(`${reason} Войдите в кабинет Kaspi: «Настройки» → «Кабинет продавца».`);
  }
}

interface CabinetShop {
  id: string;
  merchantId: string;
  mcSessionEnc: string | null;
  mcLoginEnc: string | null;
  mcPasswordEnc: string | null;
}

/** Логин и пароль кабинета: свои у магазина, иначе общие из .env. */
function cabinetCredentials(shop: CabinetShop): { login: string; password: string } | null {
  if (shop.mcLoginEnc && shop.mcPasswordEnc) {
    return { login: decryptSecret(shop.mcLoginEnc, encryptionKey()), password: decryptSecret(shop.mcPasswordEnc, encryptionKey()) };
  }
  const login = process.env.KASPI_MC_LOGIN;
  const password = process.env.KASPI_MC_PASSWORD;
  return login && password ? { login, password } : null;
}

/**
 * Выполняет действие в кабинете Kaspi от имени магазина. Если сессия
 * истекла, обновляет её без пароля, пока жива сессия сервиса входа, иначе
 * входит по паролю магазина (или из .env) и повторяет действие. Сессия сохраняется в базе.
 * Если Kaspi просит код из почты, вход должен сделать продавец сам.
 */
export async function withCabinet<T>(shop: CabinetShop, action: (client: KaspiCabinetClient) => Promise<T>): Promise<T> {
  const jar = shop.mcSessionEnc ? CookieJar.fromJSON(decryptSecret(shop.mcSessionEnc, encryptionKey())) : new CookieJar();
  const client = new KaspiCabinetClient(jar);
  const save = () =>
    prisma.shop.update({ where: { id: shop.id }, data: { mcSessionEnc: encryptSecret(client.jar.toJSON(), encryptionKey()) } });

  try {
    const result = await action(client);
    await save();
    return result;
  } catch (error) {
    if (!(error instanceof KaspiCabinetAuthError)) throw error;
  }

  if (!(await client.refreshSession())) {
    const credentials = cabinetCredentials(shop);
    if (!credentials) throw new CabinetLoginRequiredError('Сессия кабинета Kaspi истекла.');
    const result = await client.login(credentials.login, credentials.password, shop.merchantId);
    await save();
    if (result.status !== 'OK') throw new CabinetLoginRequiredError('Kaspi запросил код подтверждения из почты.');
  }
  const result = await action(client);
  await save();
  return result;
}
