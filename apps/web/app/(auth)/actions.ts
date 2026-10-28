'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { SESSION_COOKIE } from '@/lib/session';

export interface AuthState {
  error?: string;
}

async function setSessionCookie(session: { token: string; maxAgeSec: number }): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: 'lax',
    // Пока сервер работает по http без домена, secure-кука не сохранится: COOKIE_SECURE=0
    secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== '0',
    path: '/',
    maxAge: session.maxAgeSec,
  });
}

async function startSession(path: string, body: Record<string, string>): Promise<AuthState> {
  let session: { token: string; maxAgeSec: number };
  try {
    session = await api(path, { method: 'POST', body });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : 'Не удалось войти. Попробуйте ещё раз.' };
  }
  await setSessionCookie(session);
  redirect('/');
}

/** Начало входа через Telegram: одноразовый код и ссылка на бота. */
export async function startTelegramLogin(): Promise<{ code?: string; url?: string; error?: string }> {
  try {
    return await api<{ code: string; url: string }>('/auth/telegram/start', { method: 'POST' });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : 'Вход через Telegram сейчас недоступен.' };
  }
}

/** Проверка, подтвердил ли продавец вход в боте; при подтверждении ставит куку сессии. */
export async function finishTelegramLogin(code: string): Promise<{ done?: boolean; error?: string }> {
  try {
    const result = await api<{ pending?: boolean; token?: string; maxAgeSec?: number }>('/auth/telegram/finish', {
      method: 'POST',
      body: { code },
    });
    if (result.pending || !result.token) return {};
    await setSessionCookie({ token: result.token, maxAgeSec: result.maxAgeSec! });
    return { done: true };
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : 'Не удалось войти.' };
  }
}

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  return startSession('/auth/login', { email: field(formData, 'email'), password: field(formData, 'password') });
}

export async function register(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (field(formData, 'password') !== field(formData, 'password2')) return { error: 'Пароли не совпадают.' };
  return startSession('/auth/register', {
    name: field(formData, 'name'),
    email: field(formData, 'email'),
    password: field(formData, 'password'),
  });
}

export async function logout(): Promise<void> {
  await api('/auth/logout', { method: 'POST' }).catch(() => null);
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login');
}
