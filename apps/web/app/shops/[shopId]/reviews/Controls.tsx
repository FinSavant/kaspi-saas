'use client';

import { renderTemplate, type ReviewMessageKind } from '@kaspi/core/reviews';
import { useRef, useState, useTransition, type ReactNode } from 'react';
import { saveReviewSettings } from './actions';

export interface ReviewSettings {
  chatConnected: boolean;
  shopName: string;
  reviewsEnabled: boolean;
  reviewHoursFrom: number;
  reviewHoursTo: number;
  reviewDelayHours: number;
  newOrderMessages: boolean;
  reviewMessages: boolean;
  newOrderTemplate: string;
  reviewTemplate: string;
  defaults: Record<ReviewMessageKind, string>;
  params: readonly { token: string; hint: string }[];
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-slate-800 p-5 text-white shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Закрыть">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Переключатель «Рассылка работает», как в Okto. */
export function MailingToggle({ shopId, settings }: { shopId: string; settings: ReviewSettings }) {
  const [on, setOn] = useState(settings.reviewsEnabled);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-3 rounded-full bg-slate-900 py-2 pr-2 pl-4 text-white shadow">
      <span aria-hidden>💬</span>
      <div className="leading-tight">
        <div className="text-sm font-semibold">Рассылка</div>
        <div className={`text-xs ${on ? 'text-emerald-300' : 'text-slate-400'}`}>{error ?? (on ? 'работает' : 'выключена')}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await saveReviewSettings(shopId, { reviewsEnabled: !on });
            if (r.error) setError(r.error);
            else {
              setError(undefined);
              setOn(!on);
            }
          })
        }
        className={`relative h-6 w-11 rounded-full transition disabled:opacity-50 ${on ? 'bg-emerald-500' : 'bg-slate-600'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${on ? 'left-5.5' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

/** Настройки рассылки: часы работы и через сколько после выдачи просить отзыв. */
export function SettingsButton({ shopId, settings }: { shopId: string; settings: ReviewSettings }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(settings.reviewHoursFrom);
  const [to, setTo] = useState(settings.reviewHoursTo);
  const unitDays = settings.reviewDelayHours > 0 && settings.reviewDelayHours % 24 === 0;
  const [delay, setDelay] = useState(unitDays ? settings.reviewDelayHours / 24 : settings.reviewDelayHours);
  const [unit, setUnit] = useState<'hours' | 'days'>(unitDays ? 'days' : 'hours');
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const field = 'rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-white';

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-xl shadow hover:bg-slate-50" title="Настройки рассылки">
        ⚙️
      </button>
      {open && (
        <Modal title="Настройка рассылки" onClose={() => setOpen(false)}>
          <div className="max-w-md space-y-4">
            <div className="rounded-xl bg-white px-4 py-3 text-slate-900">
              <div className="font-semibold">{settings.shopName}</div>
              <div className={`text-xs ${settings.chatConnected ? 'text-emerald-700' : 'text-red-600'}`}>
                {settings.chatConnected ? '● Чат подключён' : '● Чат не подключён — «Настройки» → «Чат с покупателями»'}
              </div>
            </div>
            <label className="block space-y-1">
              <span className="text-sm font-medium">График работы (по Алматы)</span>
              <div className="flex items-center gap-2 text-sm">
                с <input type="number" min={0} max={24} value={from} onChange={(e) => setFrom(Number(e.target.value))} className={`${field} w-20`} />
                до <input type="number" min={0} max={24} value={to} onChange={(e) => setTo(Number(e.target.value))} className={`${field} w-20`} /> ч.
              </div>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Через сколько после выдачи просить отзыв</span>
              <div className="flex items-center gap-2">
                <input type="number" min={0} value={delay} onChange={(e) => setDelay(Number(e.target.value))} className={`${field} w-24`} />
                <select value={unit} onChange={(e) => setUnit(e.target.value as 'hours' | 'days')} className={field}>
                  <option value="hours">Часы</option>
                  <option value="days">Дни</option>
                </select>
              </div>
            </label>
            {error && <p className="text-sm text-red-300">{error}</p>}
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await saveReviewSettings(shopId, {
                    reviewHoursFrom: from,
                    reviewHoursTo: to,
                    reviewDelayHours: unit === 'days' ? delay * 24 : delay,
                  });
                  if (r.error) setError(r.error);
                  else setOpen(false);
                })
              }
              className="w-full rounded-xl bg-slate-950 py-3 font-semibold text-white hover:bg-black disabled:opacity-50"
            >
              {pending ? 'Сохраняю…' : 'Сохранить'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

const SAMPLE = {
  code: '484962426',
  customerName: 'Даурен',
  plannedDeliveryDate: new Date(Date.now() + 2 * 864e5),
  items: [
    { name: 'Хна мехенди красная', masterSku: '142551991' },
    { name: 'Вакуумные банки 12 шт', masterSku: '177625139' },
  ],
};

/** Шаблоны: «Новый заказ» и «Запросить отзыв», параметры через @, превью как в чате Kaspi. */
export function TemplatesButton({ shopId, settings }: { shopId: string; settings: ReviewSettings }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ReviewMessageKind>('NEW_ORDER');
  const [texts, setTexts] = useState({ NEW_ORDER: settings.newOrderTemplate, REVIEW: settings.reviewTemplate });
  const [enabled, setEnabled] = useState({ NEW_ORDER: settings.newOrderMessages, REVIEW: settings.reviewMessages });
  const [result, setResult] = useState<{ ok?: boolean; error?: string }>({});
  const [pending, start] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);

  const insert = (token: string) => {
    const el = area.current;
    const text = texts[kind];
    const at = el ? el.selectionStart : text.length;
    setTexts({ ...texts, [kind]: text.slice(0, at) + token + text.slice(el ? el.selectionEnd : at) });
    requestAnimationFrame(() => el?.focus());
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-xl shadow hover:bg-slate-50" title="Шаблоны">
        🪶
      </button>
      {open && (
        <Modal title="Шаблоны" onClose={() => setOpen(false)}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div className="flex gap-2">
                <select
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value as ReviewMessageKind);
                    setResult({});
                  }}
                  className="flex-1 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2"
                >
                  <option value="NEW_ORDER">Новый заказ</option>
                  <option value="REVIEW">Запросить отзыв</option>
                </select>
                <label className="flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm">
                  Доставлять
                  <input
                    type="checkbox"
                    checked={enabled[kind]}
                    onChange={(e) => setEnabled({ ...enabled, [kind]: e.target.checked })}
                    className="h-4 w-4 accent-cyan-400"
                  />
                </label>
              </div>
              <div className="text-xs text-slate-400">
                {kind === 'NEW_ORDER' ? 'Уходит покупателю после нового заказа.' : 'Уходит после выдачи заказа — через время из настроек.'} Нажмите
                параметр, чтобы вставить его в текст:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {settings.params.map((p) => (
                  <button key={p.token} type="button" title={p.hint} onClick={() => insert(p.token)} className="rounded-full bg-slate-700 px-2.5 py-1 text-xs hover:bg-slate-600">
                    {p.token}
                  </button>
                ))}
              </div>
              <textarea
                ref={area}
                value={texts[kind]}
                onChange={(e) => setTexts({ ...texts, [kind]: e.target.value })}
                rows={14}
                className="w-full rounded-xl border border-slate-600 bg-slate-900 p-3 text-sm leading-relaxed"
              />
              {result.error && <p className="text-sm text-red-300">{result.error}</p>}
              {result.ok && <p className="text-sm text-emerald-300">Сохранено.</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () =>
                      setResult(
                        await saveReviewSettings(shopId, {
                          newOrderTemplate: texts.NEW_ORDER,
                          reviewTemplate: texts.REVIEW,
                          newOrderMessages: enabled.NEW_ORDER,
                          reviewMessages: enabled.REVIEW,
                        }),
                      ),
                    )
                  }
                  className="flex-1 rounded-xl bg-slate-950 py-2.5 font-semibold text-cyan-300 hover:bg-black disabled:opacity-50"
                >
                  {pending ? 'Сохраняю…' : 'Сохранить'}
                </button>
                <button type="button" onClick={() => setTexts({ ...texts, [kind]: settings.defaults[kind] })} className="rounded-xl bg-white px-4 font-semibold text-slate-900">
                  Сбросить
                </button>
              </div>
            </div>
            {/* Превью в виде чата Kaspi на примере заказа */}
            <div className="flex flex-col overflow-hidden rounded-2xl bg-white text-slate-900">
              <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
                <div className="h-9 w-9 rounded-full bg-red-500" />
                <div>
                  <div className="font-semibold">{settings.shopName}</div>
                  <div className="text-xs text-slate-500">Kaspi Магазин · пример сообщения</div>
                </div>
              </div>
              <div className="flex-1 bg-slate-100 p-4">
                <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-white p-3 text-sm leading-relaxed whitespace-pre-wrap shadow-sm">
                  {renderTemplate(texts[kind], SAMPLE, settings.shopName)
                    .split(/(https:\/\/\S+)/)
                    .map((part, i) =>
                      part.startsWith('https://') ? (
                        <span key={i} className="break-all text-red-600">
                          {part}
                        </span>
                      ) : (
                        part
                      ),
                    )}
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
