import type { ReactNode } from 'react';
import type { LandingText } from '@/lib/landing-text';

/**
 * Разделы кабинета на странице о сервисе: скриншот (или макет, если на снимке нечего
 * показать без заказов) и что даёт раздел. Скриншоты — public/landing/*.png из кабинета,
 * названия магазинов на них заменены. Тексты — lib/landing-text.ts.
 */

function Frame({ children, caption }: { children: ReactNode; caption?: string }) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
      <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-3 py-2" aria-hidden>
        <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <span className="ml-3 truncate rounded bg-white px-2 py-0.5 text-[11px] text-slate-400">sanq.kz</span>
      </div>
      {children}
      {caption && <figcaption className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">{caption}</figcaption>}
    </figure>
  );
}

function Shot({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
  return (
    <Frame caption={caption}>
      {/* eslint-disable-next-line @next/next/no-img-element -- статичные скриншоты из public */}
      <img src={src} alt={alt} loading="lazy" width={800} height={500} className="block h-auto w-full" />
    </Frame>
  );
}

function Section({
  section,
  visual,
  reverse,
  tint,
}: {
  section: LandingText['robot']['section'];
  visual: ReactNode;
  reverse?: boolean;
  tint?: boolean;
}) {
  return (
    <section id={section.id} className={`scroll-mt-16 ${tint ? 'bg-slate-50' : ''}`}>
      <div className={`mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 lg:grid-cols-2 ${reverse ? 'lg:[&>*:first-child]:order-2' : ''}`}>
        <div>
          <div className="text-sm font-semibold tracking-wide text-blue-600">
            <span aria-hidden>{section.icon}</span> {section.kicker}
          </div>
          <h2 className="mt-2 text-3xl font-extrabold">{section.title}</h2>
          <p className="mt-3 text-slate-600">{section.lead}</p>
          <ul className="mt-6 space-y-2.5 text-sm text-slate-700">
            {section.points.map((p) => (
              <li key={p} className="flex gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white" aria-hidden>
                  ✓
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div>{visual}</div>
      </div>
    </section>
  );
}

/** Макет склейки накладных: заказов в «Передаче» без них на снимке не видно. */
function WaybillsMock({ t }: { t: LandingText }) {
  const m = t.waybills.mock;
  return (
    <Frame caption={t.tabs.mockCaption}>
      <div className="space-y-3 p-5 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded border border-slate-300 px-2 py-1">{m.format}</span>
          <span className="rounded border border-slate-300 px-2 py-1">{m.sort}</span>
          <span className="rounded bg-emerald-600 px-3 py-1 font-medium text-white">{m.button}</span>
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-slate-500">
          {m.shops.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-2 pt-2" aria-hidden>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="aspect-[2/3] rounded border border-slate-300 bg-white p-1.5">
              <div className="h-2 w-2/3 rounded bg-slate-800" />
              <div className="mt-1 h-1.5 w-full rounded bg-slate-200" />
              <div className="mt-1 h-1.5 w-4/5 rounded bg-slate-200" />
              <div className="mt-2 h-6 w-full rounded bg-[repeating-linear-gradient(90deg,#0f172a_0_2px,transparent_2px_4px)]" />
            </div>
          ))}
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{m.history}</div>
      </div>
    </Frame>
  );
}

function PickingMock({ t }: { t: LandingText }) {
  const m = t.picking.mock;
  return (
    <Frame caption={t.tabs.mockCaption}>
      <div className="divide-y divide-slate-100 p-2 text-sm">
        {m.rows.map(([name, qty, orders], i) => (
          <div key={name} className="flex items-center gap-3 px-3 py-3">
            <div className="h-10 w-10 shrink-0 rounded-lg bg-slate-100" aria-hidden />
            <div className="flex-1">
              <div className="font-medium">{name}</div>
              <div className="text-xs text-slate-500">
                {orders} · {m.waybill}
              </div>
            </div>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{qty}</span>
            <span className={`rounded px-2 py-1 text-xs ${i === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              {i === 0 ? `✓ ${m.picked}` : m.picked}
            </span>
            <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-500">{m.packed}</span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function ReviewsMock({ t }: { t: LandingText }) {
  const m = t.reviews.mock;
  return (
    <Frame caption={m.caption}>
      <div className="space-y-3 bg-slate-50 p-5 text-sm">
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white p-3 shadow-sm">{m.hello}</div>
        <div className="text-center text-[11px] text-slate-400">{m.later}</div>
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white p-3 shadow-sm">
          {m.ask} <span className="text-blue-600 underline">kaspi.kz/shop/review/…</span>
        </div>
        <div className="ml-auto max-w-[70%] rounded-2xl rounded-tr-sm bg-blue-600 p-3 text-white">{m.reply}</div>
      </div>
    </Frame>
  );
}

function TelegramMock({ t }: { t: LandingText }) {
  const [first, ...rest] = t.telegram.mock.lines;
  return (
    <Frame caption={t.telegram.mock.caption}>
      <div className="bg-[#e7ebf0] p-5">
        <div className="max-w-sm rounded-2xl rounded-tl-sm bg-white p-4 text-sm leading-relaxed shadow-sm">
          <div className="font-semibold">{first}</div>
          {rest.map((line) => (
            <div key={line}>{line}</div>
          ))}
          <div className="mt-2 text-right text-[11px] text-slate-400">09:10</div>
        </div>
      </div>
    </Frame>
  );
}

/** Пример порога робота: себестоимость 900 ₸ и три варианта наценки. */
function ThresholdCard({ t }: { t: LandingText }) {
  const r = t.robot;
  const variants: [string, string, boolean][] = [
    ['+3%', '1 288 ₸', false],
    ['+5%', '1 319 ₸', true],
    ['+10%', '1 405 ₸', false],
  ];
  return (
    <div className="rounded-2xl border-2 border-blue-600 bg-white p-5 shadow-lg">
      <div className="text-sm font-semibold text-blue-600">{r.example}</div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
        {variants.map(([markup, price, accent]) => (
          <div key={markup} className={`rounded-xl p-3 ${accent ? 'bg-blue-50' : 'bg-slate-50'}`}>
            <div className="text-xs text-slate-500">{r.markup}</div>
            <div className={`text-lg font-bold ${accent ? 'text-blue-700' : ''}`}>{markup}</div>
            <div className="text-xs text-slate-500">
              {r.threshold} {price}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">{r.explain}</p>
    </div>
  );
}

export function LandingShowcase({ t }: { t: LandingText }) {
  const a = t.analytics;
  return (
    <div id="tabs">
      <div className="mx-auto max-w-6xl px-4 pt-20">
        <h2 className="text-3xl font-extrabold md:text-4xl">{t.tabs.title}</h2>
        <p className="mt-3 max-w-2xl text-slate-600">{t.tabs.lead}</p>
      </div>

      {/* Аналитика — главное преимущество, поэтому подробнее всего */}
      <section id="analytics" className="scroll-mt-16">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="text-sm font-semibold tracking-wide text-blue-600">{a.kicker}</div>
          <h2 className="mt-2 max-w-3xl text-3xl font-extrabold">{a.title}</h2>
          <p className="mt-3 max-w-3xl text-slate-600">{a.lead}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {a.tabs.map((tab) => (
              <span key={tab} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                {tab}
              </span>
            ))}
          </div>
          <div className="mt-10 grid gap-8 lg:grid-cols-2">
            {a.shots.map((shot) => (
              <div key={shot.src} className="space-y-3">
                <Shot src={shot.src} alt={shot.alt} caption={shot.caption} />
                <ul className="space-y-2 text-sm text-slate-700">
                  {shot.points.map((p) => (
                    <li key={p}>✓ {p}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Section
        section={t.robot.section}
        visual={
          <div className="space-y-4">
            <ThresholdCard t={t} />
            <Shot src="/landing/robot.png" alt={t.robot.shotAlt} caption={t.robot.shotCaption} />
          </div>
        }
        tint
      />
      <Section section={t.products.section} visual={<Shot src="/landing/products.png" alt={t.products.shotAlt} caption={t.products.shotCaption} />} reverse />
      <Section section={t.waybills.section} visual={<WaybillsMock t={t} />} tint />
      <Section section={t.picking.section} visual={<PickingMock t={t} />} reverse />
      <Section section={t.reviews.section} visual={<ReviewsMock t={t} />} tint />
      <Section section={t.telegram.section} visual={<TelegramMock t={t} />} reverse />
    </div>
  );
}
