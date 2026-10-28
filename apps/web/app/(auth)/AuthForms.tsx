'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { login, register, type AuthState } from './actions';

const INPUT = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const BUTTON = 'w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(login, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Email">
        <input name="email" type="email" required autoComplete="email" className={INPUT} />
      </Field>
      <Field label="Пароль">
        <input name="password" type="password" required autoComplete="current-password" className={INPUT} />
      </Field>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? 'Вхожу…' : 'Войти'}
      </button>
      <p className="text-center text-sm text-slate-500">
        Нет аккаунта?{' '}
        <Link href="/register" className="font-medium text-blue-600 hover:underline">
          Зарегистрироваться
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(register, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Ваше имя">
        <input name="name" autoComplete="name" className={INPUT} />
      </Field>
      <Field label="Email">
        <input name="email" type="email" required autoComplete="email" className={INPUT} />
      </Field>
      <Field label="Пароль (не короче 8 символов)">
        <input name="password" type="password" required minLength={8} autoComplete="new-password" className={INPUT} />
      </Field>
      <Field label="Пароль ещё раз">
        <input name="password2" type="password" required minLength={8} autoComplete="new-password" className={INPUT} />
      </Field>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? 'Создаю аккаунт…' : 'Начать 3 дня бесплатно'}
      </button>
      <p className="text-center text-sm text-slate-500">
        Уже есть аккаунт?{' '}
        <Link href="/login" className="font-medium text-blue-600 hover:underline">
          Войти
        </Link>
      </p>
    </form>
  );
}
