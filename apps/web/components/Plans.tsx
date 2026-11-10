/** Общее для вкладки «Тарифы» и экрана «обновите тариф»: данные тарифа и карточки с оплатой в WhatsApp. */
export type Feature = 'products' | 'waybills' | 'picking' | 'robot' | 'reviews' | 'analytics';

export interface Plan {
  id: string;
  name: string;
  pricePerMonth: number;
  maxShops: number;
  maxRobotProducts: number;
  maxPreorderProducts: number;
  features: Feature[];
  reviewsIncluded: boolean;
  agentIncluded: boolean;
  single?: boolean;
}

export interface Billing {
  isAdmin: boolean;
  plan: string;
  status: 'trial' | 'paid' | 'expired';
  activeUntil: string | null;
  reviewsAddon: boolean;
  reviewsAllowed: boolean;
  agentAddon: boolean;
  agentAllowed: boolean;
  /** Открытые разделы кабинета */
  features: Feature[];
  monthlyPrice: number;
  usage: { shops: number; robotProducts: number; preorderProducts: number };
  plans: Plan[];
  reviewsAddonPrice: number;
  agentAddonPrice: number;
  trialDays: number;
  whatsapp: string | null;
}

export const money = (n: number) => `${n.toLocaleString('ru-RU')} ₸`;
export const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/** Ссылка в WhatsApp владельца с готовым текстом заявки. */
export function whatsappLink(number: string | null, text: string): string | null {
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : null;
}

/** Что входит в тариф — строки карточки. */
function planLines(p: Plan): string[] {
  if (p.single) {
    return p.features.includes('reviews')
      ? [
          '✓ 1 магазин',
          '✓ Отзывы: робот пишет покупателям и просит отзыв',
          '✓ Шаблоны сообщений и время рассылки',
          ...(p.agentIncluded ? ['✓ ИИ-агент отвечает покупателям в чате до 1 минуты'] : ['✗ Без ИИ-агента (его можно добавить опцией)']),
        ]
      : ['✓ 1 магазин', '✓ Аналитика: выручка, прибыль, товары, география', '✓ Свои расходы и удержания Kaspi'];
  }
  return [
    `✓ ${p.maxShops === 1 ? '1 магазин' : `До ${p.maxShops} магазинов`}`,
    `✓ Робот цен до ${p.maxRobotProducts} товаров`,
    `✓ Предзаказ до ${p.maxPreorderProducts} товаров`,
    '✓ Накладные, сборка',
    '✓ Аналитика',
    '✓ Telegram-отчёт',
    ...(p.reviewsIncluded ? ['✓ Отзывы включены', ...(p.agentIncluded ? ['✓ ИИ-агент отвечает покупателям в чате'] : ['✗ ИИ-агент — отдельная опция'])] : ['✗ Без отзывов']),
  ];
}

function PlanCard({ p, b }: { p: Plan; b: Billing }) {
  const isCurrent = p.id === b.plan;
  const link = whatsappLink(b.whatsapp, `Здравствуйте! Хочу оплатить тариф SANQ «${p.name}» (${money(p.pricePerMonth)} в месяц).`);
  return (
    <section className={`flex flex-col rounded-xl border bg-white p-5 ${p.id === 'pro' ? 'border-blue-600 ring-1 ring-blue-600' : 'border-slate-200'}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{p.name}</h2>
        {p.id === 'pro' && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">Популярный</span>}
      </div>
      <div className="mt-2 text-2xl font-bold">
        {money(p.pricePerMonth)}
        <span className="text-sm font-normal text-slate-500"> / месяц</span>
      </div>
      <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-700">
        {planLines(p).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className={`mt-5 rounded-lg px-4 py-2 text-center text-sm font-medium ${
            isCurrent ? 'border border-slate-300 text-slate-700 hover:bg-slate-50' : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {isCurrent ? 'Продлить' : 'Перейти на этот тариф'}
        </a>
      ) : (
        <span className="mt-5 rounded-lg bg-slate-100 px-4 py-2 text-center text-sm text-slate-400">Оплата недоступна</span>
      )}
    </section>
  );
}

export function PlanCards({ b }: { b: Billing }) {
  const full = b.plans.filter((p) => !p.single);
  const single = b.plans.filter((p) => p.single);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {full.map((p) => (
          <PlanCard key={p.id} p={p} b={b} />
        ))}
      </div>
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <h2 className="text-lg font-bold">🤖 Опция «ИИ-агент» — {money(b.agentAddonPrice)} / месяц</h2>
        <p className="mt-1 text-sm text-emerald-900">
          Агент сам отвечает покупателям в чате Kaspi до 1 минуты, изучает описания ваших товаров и учится на ваших ответах. Добавляется к тарифу
          «Только отзывы». В «Pro» и «Отзывы + ИИ-агент» он уже включён. В пробный период агент доступен бесплатно.
          {b.agentAddon && ' Опция у вас подключена.'}
        </p>
        {(() => {
          const link = whatsappLink(b.whatsapp, `Здравствуйте! Хочу подключить опцию SANQ «ИИ-агент» (${money(b.agentAddonPrice)} в месяц).`);
          return link ? (
            <a href={link} target="_blank" rel="noreferrer" className="mt-3 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
              Подключить агента
            </a>
          ) : null;
        })()}
      </section>
      {single.length > 0 && (
        <>
          <h2 className="pt-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">Нужен только один раздел</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {single.map((p) => (
              <PlanCard key={p.id} p={p} b={b} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
