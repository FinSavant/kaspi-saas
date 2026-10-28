'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { finishTelegramLogin, startTelegramLogin } from './actions';

const POLL_MS = 2000;

/**
 * Вход через Telegram: открывает бота SANQ в новой вкладке и ждёт, пока продавец
 * нажмёт там «Подтвердить вход». Новому продавцу бот сам создаёт аккаунт.
 */
export function TelegramLogin() {
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!code) return;
    const timer = setInterval(async () => {
      const result = await finishTelegramLogin(code);
      if (result.done) {
        clearInterval(timer);
        router.push('/');
        router.refresh();
      } else if (result.error) {
        clearInterval(timer);
        setCode(null);
        setError(result.error);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [code, router]);

  const start = async () => {
    setStarting(true);
    setError(null);
    // Вкладку открываем сразу по нажатию, иначе браузер её заблокирует; адрес подставим после ответа
    const tab = window.open('', '_blank');
    const result = await startTelegramLogin();
    setStarting(false);
    if (!result.code || !result.url) {
      tab?.close();
      setError(result.error ?? 'Вход через Telegram сейчас недоступен.');
      return;
    }
    if (tab) tab.location.href = result.url;
    setUrl(result.url);
    setCode(result.code);
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={start}
        disabled={starting}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
      >
        <span aria-hidden>✈️</span> {starting ? 'Открываю Telegram…' : 'Войти через Telegram'}
      </button>
      {code && (
        <p className="text-center text-xs text-slate-500">
          Нажмите «Подтвердить вход» в боте SANQ и вернитесь сюда.{' '}
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
              Открыть бота ещё раз
            </a>
          )}
        </p>
      )}
      {error && <p className="text-center text-sm text-red-600">{error}</p>}
    </div>
  );
}
