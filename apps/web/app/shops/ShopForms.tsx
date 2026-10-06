'use client';

import { useActionState } from 'react';
import { addShop, cabinetLogin, chatLogin, sendReportNow, type CabinetState, type ChatLoginState, type ShopFormState } from './actions';

const INPUT = 'w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm';
const BUTTON = 'rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function NewShopForm() {
  const [state, action, pending] = useActionState<ShopFormState, FormData>(addShop, {});

  return (
    <form action={action} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <Field label="Название магазина">
        <input name="name" required className={INPUT} />
      </Field>
      <Field label="ID продавца Kaspi" hint="Номер магазина из кабинета Kaspi, только цифры.">
        <input name="merchantId" required inputMode="numeric" pattern="\d+" className={INPUT} />
      </Field>
      <Field label="API-токен Kaspi" hint="Кабинет Kaspi → «Настройки» → «Токен API». Нужен для заказов, накладных и аналитики.">
        <input name="apiToken" required type="password" autoComplete="off" className={INPUT} />
      </Field>

      <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-sm font-medium">Пользователь кабинета Kaspi — для товаров и робота</legend>
        <p className="text-xs text-slate-500">
          Создайте в кабинете Kaspi («Управление пользователями») отдельного пользователя с правом «Загрузка товаров». Можно
          указать позже в настройках магазина.
        </p>
        <Field label="Логин (почта)">
          <input name="mcLogin" type="email" autoComplete="off" className={INPUT} />
        </Field>
        <Field label="Пароль">
          <input name="mcPassword" type="password" autoComplete="new-password" className={INPUT} />
        </Field>
      </fieldset>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? 'Проверяю токен…' : 'Подключить магазин'}
      </button>
    </form>
  );
}

/** Вход по телефону для чата с покупателями: номер → код из SMS. */
export function ChatLoginForm({ shopId }: { shopId: string }) {
  const [state, action, pending] = useActionState<ChatLoginState, FormData>(chatLogin, {});

  if (state.status === 'OK') {
    return <p className="text-sm text-emerald-700">Чат подключён. Диалогов найдено: {state.chats}.</p>;
  }
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="shopId" value={shopId} />
      {state.status === 'SMS_SENT' ? (
        <Field label={`Код из SMS на ${state.sentTo}`}>
          <input name="code" required autoComplete="one-time-code" inputMode="numeric" className={INPUT} />
        </Field>
      ) : (
        <Field label="Номер телефона пользователя магазина" hint="Номер должен быть добавлен в кабинете Kaspi пользователем с правами на заказы.">
          <input name="phone" required type="tel" placeholder="+7 7__ ___ __ __" className={INPUT} />
        </Field>
      )}
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? '…' : state.status === 'SMS_SENT' ? 'Подтвердить код' : 'Получить SMS'}
      </button>
    </form>
  );
}

export function ReportNowButton({ shopId }: { shopId: string }) {
  const [state, action, pending] = useActionState(sendReportNow, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="shopId" value={shopId} />
      <button type="submit" disabled={pending} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50">
        {pending ? 'Отправляю…' : 'Прислать отчёт сейчас'}
      </button>
      {state.ok && <span className="text-sm text-emerald-700">Отчёт придёт в Telegram примерно через минуту.</span>}
      {state.error && <span className="text-sm text-red-600">{state.error}</span>}
    </form>
  );
}

/** Вход в кабинет Kaspi: логин и пароль (можно оставить сохранённые), затем код из почты, если Kaspi его пришлёт. */
export function CabinetLoginForm({ shopId, hasSavedLogin }: { shopId: string; hasSavedLogin: boolean }) {
  const [state, action, pending] = useActionState<CabinetState, FormData>(cabinetLogin, {});

  if (state.status === 'OK') {
    return <p className="text-sm text-emerald-700">Вход выполнен. Товаров в продаже: {state.offers}. Теперь их можно синхронизировать в разделе «Робот».</p>;
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="shopId" value={shopId} />
      {state.status === 'MFA_REQUIRED' ? (
        <Field label={`Код из письма Kaspi на ${state.email}`}>
          <input name="code" required autoComplete="one-time-code" inputMode="numeric" className={INPUT} />
        </Field>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Логин (почта)">
            <input name="login" type="email" autoComplete="off" required={!hasSavedLogin} className={INPUT} />
          </Field>
          <Field label="Пароль">
            <input name="password" type="password" autoComplete="new-password" required={!hasSavedLogin} className={INPUT} />
          </Field>
          {hasSavedLogin && <p className="text-xs text-slate-500 sm:col-span-2">Оставьте пустыми, чтобы войти с сохранёнными логином и паролем.</p>}
        </div>
      )}
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? 'Вхожу…' : state.status === 'MFA_REQUIRED' ? 'Подтвердить код' : 'Войти в кабинет'}
      </button>
    </form>
  );
}
