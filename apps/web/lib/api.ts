import 'server-only';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Запрос к api от имени веб-кабинета. Вызывается только на сервере: ключ не попадает в браузер. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const key = process.env.API_INTERNAL_KEY;
  if (!key) throw new ApiError(500, 'API_INTERNAL_KEY is not set');

  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'x-api-key': key,
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new ApiError(res.status, payload?.error ?? `API responded with ${res.status}`);
  }
  return res.json();
}
