'use client';

import { createContext, useContext, useState, useTransition, type ReactNode } from 'react';
import { bulkUpdate, type BulkAction } from './actions';

interface Selection {
  ids: string[];
  selected: Set<string>;
  toggle: (id: string) => void;
  setAll: (on: boolean) => void;
}

const SelectionContext = createContext<Selection | null>(null);
const useSelection = () => useContext(SelectionContext)!;

/** Выбор товаров галочками для массовых действий; `ids` — товары, видимые сейчас в таблице. */
export function BulkProvider({ ids, children }: { ids: string[]; children: ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Выбранные, но скрытые фильтром или поиском товары не считаются
  const visible = new Set([...selected].filter((id) => ids.includes(id)));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const setAll = (on: boolean) => setSelected(on ? new Set(ids) : new Set());
  return <SelectionContext.Provider value={{ ids, selected: visible, toggle, setAll }}>{children}</SelectionContext.Provider>;
}

const BOX = 'h-4 w-4 cursor-pointer accent-slate-900';

export function SelectAllCheckbox() {
  const { ids, selected, setAll } = useSelection();
  const all = ids.length > 0 && selected.size === ids.length;
  return (
    <input
      type="checkbox"
      checked={all}
      ref={(el) => {
        if (el) el.indeterminate = selected.size > 0 && !all;
      }}
      onChange={() => setAll(!all)}
      aria-label="Выбрать все"
      className={BOX}
    />
  );
}

export function RowCheckbox({ id }: { id: string }) {
  const { selected, toggle } = useSelection();
  return <input type="checkbox" checked={selected.has(id)} onChange={() => toggle(id)} aria-label="Выбрать товар" className={BOX} />;
}

const ACTIONS: { action: BulkAction; label: string; icon: string; input?: string; hint?: string }[] = [
  { action: 'enable', label: 'Включить робота', icon: '🟢' },
  { action: 'disable', label: 'Выключить робота', icon: '🔴' },
  { action: 'step', label: 'Изменить шаг', icon: '↘', input: 'Шаг, ₸' },
  { action: 'floor', label: 'Изменить мин. цену', icon: '⤓', input: 'Мин. цена, ₸' },
  { action: 'ceiling', label: 'Изменить макс. цену', icon: '⤒', input: 'Макс. цена, ₸', hint: 'Пусто — без максимума' },
  { action: 'preorder', label: 'Изменить предзаказ', icon: '🗓', input: 'Предзаказ, дней', hint: '1–30, пусто — убрать' },
  { action: 'cost', label: 'Изменить себестоимость', icon: '₸', input: 'Себестоимость, ₸', hint: 'Пусто — убрать' },
];

/** Панель массовых действий: появляется, когда выбран хотя бы один товар. */
export function BulkBar({ shopId }: { shopId: string }) {
  const { selected, setAll } = useSelection();
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState<(typeof ACTIONS)[number] | null>(null);
  const [value, setValue] = useState('');
  const [result, setResult] = useState<{ message?: string; error?: string }>({});
  const [pending, start] = useTransition();

  if (selected.size === 0 && !result.message) return null;

  const run = (action: BulkAction, raw = '') =>
    start(async () => {
      const r = await bulkUpdate(shopId, [...selected], action, raw);
      setResult(r);
      if (!r.error) {
        setEditing(null);
        setValue('');
        setAll(false);
      }
    });

  return (
    <div className="sticky top-2 z-30 flex flex-wrap items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
      {selected.size > 0 && (
        <>
          <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-slate-900">{selected.size}</span>
          <span>выбрано</span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenu((v) => !v)}
              className="rounded-full border border-slate-500 px-3 py-1 font-medium hover:bg-slate-800"
            >
              Действия ▾
            </button>
            {menu && (
              <ul className="absolute left-0 mt-2 min-w-64 overflow-hidden rounded-xl bg-slate-800 py-1 shadow-xl">
                {ACTIONS.map((a) => (
                  <li key={a.action}>
                    <button
                      type="button"
                      onClick={() => {
                        setMenu(false);
                        setResult({});
                        if (a.input) setEditing(a);
                        else run(a.action);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-700"
                    >
                      <span className="w-5 text-center" aria-hidden>
                        {a.icon}
                      </span>
                      {a.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {editing && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(editing.action, value);
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <input
                autoFocus
                inputMode="numeric"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={editing.input}
                className="w-40 rounded-lg border border-slate-500 bg-slate-800 px-3 py-1.5 text-white placeholder:text-slate-400"
              />
              {editing.hint && <span className="text-xs text-slate-400">{editing.hint}</span>}
              <button type="submit" disabled={pending} className="rounded-lg bg-cyan-400 px-3 py-1.5 font-semibold text-slate-900 disabled:opacity-50">
                {pending ? '…' : 'Сохранить'}
              </button>
              <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-slate-500 px-3 py-1.5">
                Отмена
              </button>
            </form>
          )}
          <button type="button" onClick={() => setAll(false)} className="ml-auto text-xs text-slate-400 hover:text-white">
            Снять выбор
          </button>
        </>
      )}
      {pending && !editing && <span className="text-slate-300">Применяю…</span>}
      {result.message && (
        <span className="text-emerald-300">
          {result.message}
          {selected.size === 0 && (
            <button type="button" onClick={() => setResult({})} className="ml-3 text-xs text-slate-400 hover:text-white">
              ✕
            </button>
          )}
        </span>
      )}
      {result.error && <span className="text-red-300">{result.error}</span>}
    </div>
  );
}
