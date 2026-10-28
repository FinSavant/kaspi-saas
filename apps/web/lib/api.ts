import 'server-only';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { SESSION_COOKIE, SESSION_HEADER } from './session';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Заголовки для api: общий ключ веб-кабинета и сессия вошедшего продавца. */
export async function apiHeaders(): Promise<Record<string, string>> {
  const key = process.env.API_INTERNAL_KEY;
  if (!key) throw new ApiError(500, 'API_INTERNAL_KEY is not set');
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return { 'x-api-key': key, ...(token ? { [SESSION_HEADER]: token } : {}) };
}

/** Запрос к api от имени веб-кабинета. Вызывается только на сервере: ключ не попадает в браузер. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      ...(await apiHeaders()),
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });
  // Сессия истекла или её нет — на страницу входа
  if (res.status === 401 && !path.startsWith('/auth/')) redirect('/login');
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    // Чужой или удалённый магазин — обычная страница «не найдено»
    if (res.status === 404 && payload?.error === 'shop not found') notFound();
    // Срок тарифа истёк — весь кабинет закрыт экраном «обновите тариф»
    if (res.status === 402 && payload?.code === 'expired') redirect('/expired');
    throw new ApiError(res.status, payload?.error ?? `API responded with ${res.status}`);
  }
  return res.json();
}
