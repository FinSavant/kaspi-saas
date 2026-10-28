import type { ReactNode } from 'react';

/**
 * Разделы кабинета на странице о сервисе: скриншот (или макет, если на снимке нечего
 * показать без заказов) и что даёт раздел. Скриншоты — public/landing/*.png из кабинета,
 * названия магазинов на них заменены.
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
  id,
  icon,
  kicker,
  title,
  lead,
  points,
  visual,
  reverse,
  tint,
}: {
  id: string;
  icon: string;
  kicker: string;
  title: string;
  lead: string;
  points: string[];
  visual: ReactNode;
  reverse?: boolean;
  tint?: boolean;
}) {
  return (
    <section id={id} className={`scroll-mt-16 ${tint ? 'bg-slate-50' : ''}`}>
      <div className={`mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 lg:grid-cols-2 ${reverse ? 'lg:[&>*:first-child]:order-2' : ''}`}>
        <div>
          <div className="text-sm font-semibold tracking-wide text-blue-600">
            <span aria-hidden>{icon}</span> {kicker}
          </div>
          <h2 className="mt-2 text-3xl font-extrabold">{title}</h2>
          <p className="mt-3 text-slate-600">{lead}</p>
          <ul className="mt-6 space-y-2.5 text-sm text-slate-700">
            {points.map((p) => (
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
function WaybillsMock() {
  return (
    <Frame caption="Макет экрана">
      <div className="space-y-3 p-5 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded border border-slate-300 px-2 py-1">Термопринтер, 100×150 мм</span>
          <span className="rounded border border-slate-300 px-2 py-1">По названию товара</span>
          <span className="rounded bg-emerald-600 px-3 py-1 font-medium text-white">Получить накладные</span>
        </div>
        <div className="flex gap-4 text-xs text-slate-500">
          <span>☑ Магазин 1</span>
          <span>☑ Магазин 2</span>
          <span>Город: все · Товар: все</span>
        </div>
        <div className="grid grid-cols-4 gap-2 pt-2">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="aspect-[2/3] rounded border border-slate-300 bg-white p-1.5">
              <div className="h-2 w-2/3 rounded bg-slate-800" />
              <div className="mt-1 h-1.5 w-full rounded bg-slate-200" />
              <div className="mt-1 h-1.5 w-4/5 rounded bg-slate-200" />
              <div className="mt-2 h-6 w-full rounded bg-[repeating-linear-gradient(90deg,#0f172a_0_2px,transparent_2px_4px)]" />
            </div>
          ))}
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">История склеек: сегодня 09:12 — 34 накладные · Скачать · Повторить</div>
      </div>
    </Frame>
  );
}

function PickingMock() {
  const rows = [
    ['Массажные банки, набор', '6 шт', '4 заказа'],
    ['Крем для лица 50 мл', '3 шт', '3 заказа'],
    ['Дезодорант-кристалл 60 г', '2 шт', '1 заказ'],
  ];
  return (
    <Frame caption="Макет экрана">
      <div className="divide-y divide-slate-100 p-2 text-sm">
        {rows.map(([name, qty, orders], i) => (
          <div key={name} className="flex items-center gap-3 px-3 py-3">
            <div className="h-10 w-10 shrink-0 rounded-lg bg-slate-100" aria-hidden />
            <div className="flex-1">
              <div className="font-medium">{name}</div>
              <div className="text-xs text-slate-500">{orders} · накладная каждого заказа</div>
            </div>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{qty}</span>
            <span className={`rounded px-2 py-1 text-xs ${i === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              {i === 0 ? '✓ Собрано' : 'Собрано'}
            </span>
            <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-500">Упаковано</span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function ReviewsMock() {
  return (
    <Frame caption="Макет: сообщения в чате Kaspi">
      <div className="space-y-3 bg-slate-50 p-5 text-sm">
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white p-3 shadow-sm">
          Здравствуйте, Айгерим! Спасибо за заказ №482910. Мы уже собираем его — сообщим, если будут вопросы 🙌
        </div>
        <div className="text-center text-[11px] text-slate-400">через 2 дня, после выдачи</div>
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white p-3 shadow-sm">
          Надеемся, товар понравился! Оставьте, пожалуйста, отзыв — это займёт минуту:{' '}
          <span className="text-blue-600 underline">kaspi.kz/shop/review/…</span>
        </div>
        <div className="ml-auto max-w-[70%] rounded-2xl rounded-tr-sm bg-blue-600 p-3 text-white">Спасибо, всё отлично! Оставила ⭐⭐⭐⭐⭐</div>
      </div>
    </Frame>
  );
}

function TelegramMock() {
  return (
    <Frame caption="Макет: утренний отчёт в Telegram">
      <div className="bg-[#e7ebf0] p-5">
        <div className="max-w-sm rounded-2xl rounded-tl-sm bg-white p-4 text-sm leading-relaxed shadow-sm">
          <div className="font-semibold">🏪 Мой магазин · вчера</div>
          <div>🛒 Новых заказов: 23 на 61 400 ₸</div>
          <div>📦 Выдано: 19 заказов</div>
          <div>💰 Поступит на счёт: 48 900 ₸</div>
          <div>📈 Прибыль: 14 200 ₸</div>
          <div>🚚 В пути: 31 заказ на 82 300 ₸</div>
          <div>🤖 Робот: 41 товар, 33 на 1-м месте</div>
          <div>⚠️ Заканчиваются: 3 товара</div>
          <div className="mt-2 text-right text-[11px] text-slate-400">09:10</div>
        </div>
      </div>
    </Frame>
  );
}

const ANALYTICS_TABS = ['Обзор', 'Выручка', 'Товары', 'География', 'Доставка и оплата', 'Прибыль', 'В пути', 'Отмены'];

export function LandingShowcase() {
  return (
    <div id="tabs">
      <div className="mx-auto max-w-6xl px-4 pt-20">
        <h2 className="text-3xl font-extrabold md:text-4xl">Что внутри SANQ — по вкладкам</h2>
        <p className="mt-3 max-w-2xl text-slate-600">Настоящие экраны кабинета. В каждой вкладке есть значок «?» с короткой инструкцией — разобраться можно за пять минут.</p>
      </div>

      {/* Аналитика — главное преимущество, поэтому подробнее всего */}
      <section id="analytics" className="scroll-mt-16">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="text-sm font-semibold tracking-wide text-blue-600">📈 АНАЛИТИКА</div>
          <h2 className="mt-2 max-w-3xl text-3xl font-extrabold">Прибыль до тенге — по каждому товару и каждой штуке</h2>
          <p className="mt-3 max-w-3xl text-slate-600">
            Большинство продавцов видят только выручку. SANQ вычитает из каждой продажи всё, что удерживает Kaspi, и вашу себестоимость — и
            показывает, сколько на самом деле осталось.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {ANALYTICS_TABS.map((t) => (
              <span key={t} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                {t}
              </span>
            ))}
          </div>

          <div className="mt-10 grid gap-8 lg:grid-cols-2">
            <div className="space-y-3">
              <Shot src="/landing/analytics-products.png" alt="Аналитика по товарам: расходы на единицу, прибыль и маржа" caption="Товары: расходы на одну штуку, прибыль, маржа и ABC-анализ" />
              <ul className="space-y-2 text-sm text-slate-700">
                <li>✓ <b>Расходы на единицу товара</b>: комиссия Kaspi с НДС, Kaspi Pay, доставка и себестоимость одной штуки</li>
                <li>✓ Прибыль, маржа и доля в выручке по каждому товару, ABC-анализ</li>
                <li>✓ Сортировка «Сначала убыточные» и фильтр «Только в минусе» — сразу видно, что продаётся себе в убыток</li>
                <li>✓ Себестоимость вписывается прямо в таблицу — прибыль пересчитывается сразу</li>
              </ul>
            </div>
            <div className="space-y-3">
              <Shot src="/landing/analytics-expenses.png" alt="Детализация расходов и свои расходы" caption="Прибыль: детализация удержаний Kaspi и ваши расходы" />
              <ul className="space-y-2 text-sm text-slate-700">
                <li>✓ Комиссия по категории товара — по официальным тарифам Kaspi 2026, ставку можно поправить</li>
                <li>✓ НДС на комиссию, Kaspi Pay, налог и фактическая доставка по каждому заказу</li>
                <li>✓ <b>Свои расходы</b>: до 4 статей (реклама, упаковка, зарплата…) в процентах от выручки</li>
                <li>✓ Сравнение каждой статьи с прошлым периодом</li>
              </ul>
            </div>
            <div className="space-y-3">
              <Shot src="/landing/analytics-overview.png" alt="Обзор: выручка, заказы, средний чек, возвраты, динамика" caption="Обзор: главные цифры и динамика выручки и прибыли" />
              <ul className="space-y-2 text-sm text-slate-700">
                <li>✓ Любой период: сегодня, вчера, 7/30/90 дней, год или свои даты — и рост к прошлому периоду</li>
                <li>✓ «Ожидается к поступлению»: деньги и прибыль по заказам, которые ещё в пути</li>
                <li>✓ Доля возвратов и отмен, среднее время до передачи курьеру</li>
              </ul>
            </div>
            <div className="space-y-3">
              <Shot src="/landing/analytics-geography.png" alt="География продаж по городам" caption="География: в каких городах вас покупают" />
              <ul className="space-y-2 text-sm text-slate-700">
                <li>✓ Топ городов по выручке, заказам и среднему чеку</li>
                <li>✓ Способы доставки и оплаты, отмены и возвраты</li>
                <li>✓ Заказы за год загружаются сами при подключении магазина</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <Section
        id="robot"
        icon="🤖"
        kicker="РОБОТ ЦЕН"
        title="Демпинг-бот, который не уводит вас в минус"
        lead="Обычный демпинг-бот снижает цену, пока не обгонит всех, — даже ниже себестоимости. В SANQ вы задаёте минимальный порог: себестоимость плюс нужный процент прибыли, и робот никогда не опустится ниже."
        points={[
          'Минимальный порог «себестоимость + свой процент»: например +3%, +5% или +10% — проценты задаёте сами',
          'SANQ сам считает цену порога с учётом комиссии Kaspi с НДС, Kaspi Pay, налога, ваших расходов и доставки — вы видите, сколько останется на руках',
          'Мин. и макс. цена и шаг снижения для каждого товара',
          'Предупреждение «мин. цена ниже!», если граница робота ниже выгодной цены',
          'Позиция в карточке, число продавцов и цена первого места',
          'Плитки: робот включён, на 1-м месте, достиг мин. цены',
          'Массовые действия: включить робота, задать шаг или границы сразу для многих товаров',
        ]}
        visual={
          <div className="space-y-4">
            <div className="rounded-2xl border-2 border-blue-600 bg-white p-5 shadow-lg">
              <div className="text-sm font-semibold text-blue-600">Пример: себестоимость товара 900 ₸</div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">наценка</div>
                  <div className="text-lg font-bold">+3%</div>
                  <div className="text-xs text-slate-500">порог 1 288 ₸</div>
                </div>
                <div className="rounded-xl bg-blue-50 p-3">
                  <div className="text-xs text-slate-500">наценка</div>
                  <div className="text-lg font-bold text-blue-700">+5%</div>
                  <div className="text-xs text-slate-500">порог 1 319 ₸</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">наценка</div>
                  <div className="text-lg font-bold">+10%</div>
                  <div className="text-xs text-slate-500">порог 1 405 ₸</div>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Порог — цена, при которой после всех удержаний Kaspi остаётся выбранный процент прибыли. Робот снижает цену до первого места, но не
                ниже порога.
              </p>
            </div>
            <Shot src="/landing/robot.png" alt="Робот цен: минимальная цена с наценкой, границы и шаг" caption="Робот цен: колонка «Мин. с наценкой» — цена порога для каждого варианта" />
          </div>
        }
        tint
      />

      <Section
        id="products"
        icon="🏷️"
        kicker="ТОВАРЫ / ПРЕДЗАКАЗ"
        title="Цены, остатки и предзаказ — прямо из таблицы"
        lead="Все товары магазина в одном списке. Изменения уходят в кабинет Kaspi сами — не нужно заходить туда и править вручную."
        points={[
          'Цену можно поменять прямо в таблице — она обновится в Kaspi',
          'Остатки и наличие по каждому складу',
          'Предзаказ на 1–30 дней в один клик: товар не пропадает с витрины, когда закончился',
          'Себестоимость каждого товара — для прибыли и минимальной цены',
          'Поиск, фильтры (на предзаказе, с ботом, на 1-м месте, не в топе, архив) и сортировка',
          'Синхронизация товаров с Kaspi одной кнопкой',
        ]}
        visual={<Shot src="/landing/products.png" alt="Товары: цена, склады, себестоимость и предзаказ" caption="Товары/Предзаказ" />}
        reverse
      />

      <Section
        id="waybills"
        icon="🧾"
        kicker="НАКЛАДНЫЕ"
        title="Все накладные дня — одним файлом за секунды"
        lead="Не нужно открывать и печатать каждый заказ по отдельности. SANQ сразу склеивает накладные всех заказов из «Передачи» в один PDF — нажали кнопку и печатаете."
        points={[
          'Склейка сразу, одной кнопкой — десятки накладных за секунды вместо ручной печати по одной',
          'Пересобрать в любой момент: поменяли формат или фильтр — склеили заново',
          'Термопринтер 100×150 мм или A4 по 4 и по 8 на листе',
          'Сортировка по названию товара — удобно собирать',
          'Фильтры по городу, товару и номеру заказа',
          'Несколько магазинов — в одном файле',
          'Повторная печать уже склеенного файла и история склеек за сутки',
          'Команда /print в Telegram — накладные придут прямо в чат',
        ]}
        visual={<WaybillsMock />}
        tint
      />

      <Section
        id="picking"
        icon="📦"
        kicker="СБОРКА"
        title="Собирайте много заказов быстрее и без ошибок"
        lead="Незаменимо, когда заказов десятки и сотни в день. Вместо того чтобы ходить к полке за каждым заказом, вы видите общий список: сколько штук каждого товара взять сразу и в какие заказы разложить."
        points={[
          'Заказы сгруппированы по товару — одна ходка к полке вместо десяти, на сборку уходит меньше времени',
          'Фото, количество и номера заказов по каждому товару',
          'Отметки «Собрано» и «Упаковано» — ничего не забудете и не перепутаете, даже если собирают несколько человек',
          'Накладная отдельного заказа — одной кнопкой',
        ]}
        visual={<PickingMock />}
        reverse
      />

      <Section
        id="reviews"
        icon="💬"
        kicker="ОТЗЫВЫ"
        title="Больше отзывов — выше в поиске Kaspi"
        lead="Робот пишет покупателю в чат Kaspi: благодарит за заказ, а после выдачи просит оставить отзыв со ссылкой на товар."
        points={[
          'Свои шаблоны сообщений с именем покупателя и номером заказа',
          'Часы рассылки и задержка после выдачи',
          'Список: кому отправлено, кто ответил, что не доставлено',
          'Только новые заказы — старым покупателям не пишет',
        ]}
        visual={<ReviewsMock />}
        tint
      />

      <Section
        id="telegram"
        icon="✈️"
        kicker="TELEGRAM"
        title="Магазин под рукой — в Telegram"
        lead="Каждое утро в 09:10 бот присылает отчёт за вчера, а командами можно управлять магазином с телефона."
        points={[
          'Заказы, выдачи, деньги к поступлению, прибыль и деньги в пути',
          'Как работает робот и какие товары заканчиваются',
          '/print — накладные, /repricer_on и /repricer_off — робот',
          'Вход на сайт через Telegram — без пароля',
        ]}
        visual={<TelegramMock />}
        reverse
      />
    </div>
  );
}
