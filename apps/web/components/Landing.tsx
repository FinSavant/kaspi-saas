import { PLANS, REVIEWS_ADDON_PRICE, TRIAL_DAYS, type Plan } from '@kaspi/core/plans';
import Link from 'next/link';
import { LandingShowcase } from './LandingShowcase';
import { Logo } from './Logo';

/**
 * Открытая страница sanq.kz для тех, кто пришёл из поиска: что умеет SANQ, тарифы и
 * связь в WhatsApp. Вошедший продавец её не видит — его сразу ведёт в кабинет.
 */

const money = (n: number) => `${n.toLocaleString('ru-RU')} ₸`;

function whatsapp(text: string): string {
  const number = (process.env.SANQ_WHATSAPP ?? '').replace(/\D/g, '');
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : '/register';
}

const FEATURES = [
  {
    icon: '🤖',
    title: 'Робот цен',
    text: 'Следит за конкурентами в карточке и держит ваш товар на первом месте. Ниже вашей минимальной цены не опустится никогда.',
  },
  {
    icon: '📈',
    title: 'Точная прибыль',
    text: 'Комиссия Kaspi по каждой категории, НДС, Kaspi Pay, доставка, налог и ваши расходы — видно, сколько вы реально заработали.',
  },
  {
    icon: '🧾',
    title: 'Накладные в один клик',
    text: 'Все заказы из «Передачи» — одним PDF для термопринтера 100×150 или листа A4. Несколько магазинов — в одном файле.',
  },
  {
    icon: '📦',
    title: 'Сборка заказов',
    text: 'Заказы сгруппированы по товару: сколько штук собрать, отметки «Собрано» и «Упаковано», накладная каждого заказа.',
  },
  {
    icon: '⏳',
    title: 'Предзаказ',
    text: 'Ставьте товар на предзаказ на нужное число дней прямо из таблицы — SANQ сам обновит Kaspi. Закончился товар — продажи не встают.',
  },
  {
    icon: '💬',
    title: 'Отзывы',
    text: 'Робот поздравляет покупателя с заказом и после выдачи просит оставить отзыв. Тексты и время рассылки — ваши.',
  },
  {
    icon: '✈️',
    title: 'Telegram-бот',
    text: 'Каждое утро — отчёт за вчера: заказы, выдачи, деньги к поступлению и товары, которые заканчиваются.',
  },
  {
    icon: '🏪',
    title: 'Несколько магазинов',
    text: 'Подключите все свои магазины Kaspi и переключайтесь между ними в один клик.',
  },
];

const STEPS = [
  { title: 'Зарегистрируйтесь', text: 'По email или через Telegram — за минуту. Первые 3 дня бесплатно, без оплаты.' },
  { title: 'Подключите магазин', text: 'Вставьте API-токен и данные кабинета Kaspi. Заказы за год загрузятся сами.' },
  { title: 'Включите робота и смотрите прибыль', text: 'Укажите себестоимость и минимальную цену — дальше SANQ работает 24/7.' },
];

const FAQ = [
  {
    q: 'Что такое SANQ?',
    a: 'SANQ (sanq.kz) — сервис для продавцов Kaspi.kz: демпинг-бот (робот цен) с минимальным порогом «себестоимость + процент», аналитика прибыли с учётом всех удержаний Kaspi, склейка накладных, сборка заказов, предзаказ, рассылка просьб об отзывах и отчёт в Telegram.',
  },
  {
    q: 'Какой демпинг-бот для Kaspi не продаёт в минус?',
    a: 'В SANQ минимальная цена робота задаётся как себестоимость плюс нужный процент прибыли (например +3%, +5%, +10%). SANQ сам считает этот порог с учётом комиссии Kaspi по категории, НДС, Kaspi Pay, доставки, налога и ваших расходов — и робот не опускает цену ниже.',
  },
  {
    q: 'Как посчитать чистую прибыль на Kaspi?',
    a: 'В аналитике SANQ из каждой продажи вычитаются комиссия Kaspi по категории (тарифы 2026), НДС на комиссию, Kaspi Pay, фактическая доставка, налог, себестоимость и свои расходы. Видно прибыль, маржу и расходы на одну штуку по каждому товару.',
  },
  {
    q: 'Робот не продаст товар в убыток?',
    a: 'Нет. Вы задаёте минимальную цену, ниже которой робот не опустится. SANQ сам подсказывает цену с нужной наценкой (+5%, +10%) с учётом всех комиссий Kaspi и доставки.',
  },
  {
    q: 'Это безопасно для моего магазина?',
    a: 'Токены и пароли хранятся в зашифрованном виде, доступа к ним нет ни у кого. Робота можно поставить на паузу в любой момент — в кабинете или командой в Telegram.',
  },
  {
    q: 'Как оплатить тариф?',
    a: 'Нажмите кнопку тарифа — откроется WhatsApp с готовым сообщением. После оплаты доступ продлевается в течение дня.',
  },
  {
    q: 'Что будет после пробного периода?',
    a: 'Кабинет попросит выбрать тариф, робот остановится. Все ваши данные и настройки сохранятся — после оплаты всё продолжит работать как было.',
  },
  {
    q: 'Можно подключить только отзывы или только аналитику?',
    a: `Да, для этого есть отдельные тарифы по ${money(5_990)} в месяц.`,
  },
];

function planLines(p: Plan): string[] {
  if (p.single) {
    return p.features.includes('reviews')
      ? ['1 магазин', 'Рассылка покупателям и просьба об отзыве', 'Свои шаблоны и время рассылки']
      : ['1 магазин', 'Выручка, прибыль, товары, география', 'Свои расходы и удержания Kaspi'];
  }
  return [
    p.maxShops === 1 ? '1 магазин' : `До ${p.maxShops} магазинов`,
    `Робот цен до ${p.maxRobotProducts} товаров`,
    `Предзаказ до ${p.maxPreorderProducts} товаров`,
    'Накладные, сборка, аналитика, Telegram-отчёт',
    p.reviewsIncluded ? 'Отзывы включены' : `Отзывы — плюс ${money(REVIEWS_ADDON_PRICE)} в месяц`,
  ];
}

function PlanCard({ p }: { p: Plan }) {
  const popular = p.id === 'pro';
  return (
    <div className={`flex flex-col rounded-2xl border p-6 ${popular ? 'border-blue-500 bg-blue-600 text-white shadow-xl shadow-blue-600/20' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold">{p.name}</h3>
        {popular && <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold">Популярный</span>}
      </div>
      <div className="mt-3 text-3xl font-extrabold">
        {money(p.pricePerMonth)}
        <span className={`text-sm font-normal ${popular ? 'text-blue-100' : 'text-slate-500'}`}> / месяц</span>
      </div>
      <ul className={`mt-5 flex-1 space-y-2 text-sm ${popular ? 'text-blue-50' : 'text-slate-700'}`}>
        {planLines(p).map((line) => (
          <li key={line} className="flex gap-2">
            <span aria-hidden>✓</span>
            {line}
          </li>
        ))}
      </ul>
      <a
        href={whatsapp(`Здравствуйте! Хочу подключить тариф SANQ «${p.name}» (${money(p.pricePerMonth)} в месяц).`)}
        target="_blank"
        rel="noreferrer"
        className={`mt-6 rounded-xl px-4 py-3 text-center text-sm font-semibold ${
          popular ? 'bg-white text-blue-700 hover:bg-blue-50' : 'bg-slate-900 text-white hover:bg-slate-700'
        }`}
      >
        Подключить в WhatsApp
      </a>
    </div>
  );
}

export function Landing() {
  const full = PLANS.filter((p) => !p.single);
  const single = PLANS.filter((p) => p.single);
  const ask = whatsapp('Здравствуйте! Хочу узнать про SANQ для своего магазина на Kaspi.');
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'SANQ',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: 'https://sanq.kz',
    description: 'Робот цен, аналитика прибыли, накладные, предзаказ и отзывы для продавцов Kaspi.kz.',
    offers: PLANS.map((p) => ({ '@type': 'Offer', name: p.name, price: p.pricePerMonth, priceCurrency: 'KZT' })),
    areaServed: 'KZ',
    inLanguage: 'ru',
  };
  // Вопросы-ответы в разметке schema.org — их читают поиск и ИИ-помощники
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };

  return (
    <div className="bg-white text-slate-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />

      {/* Шапка */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Logo dark />
          <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
            <a href="#features" className="hover:text-white">Возможности</a>
            <a href="#analytics" className="hover:text-white">Аналитика</a>
            <a href="#robot" className="hover:text-white">Робот цен</a>
            <a href="#prices" className="hover:text-white">Тарифы</a>
            <a href="#faq" className="hover:text-white">Вопросы</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-200 hover:text-white">
              Войти
            </Link>
            <Link href="/register" className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500">
              Попробовать
            </Link>
          </div>
        </div>
      </header>

      {/* Первый экран */}
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div className="pointer-events-none absolute -top-40 right-0 h-[32rem] w-[32rem] rounded-full bg-blue-600/30 blur-3xl" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
          <div>
            <div className="text-xs font-semibold tracking-[0.3em] text-blue-400">ЦИФРЫ. АНАЛИТИКА. РОСТ.</div>
            <h1 className="mt-4 text-4xl leading-tight font-extrabold md:text-5xl">
              Сервис для продавцов Kaspi: <span className="text-blue-500">первое место</span> в карточке и точная прибыль
            </h1>
            <p className="mt-5 text-lg text-slate-300">
              SANQ держит ваши цены выгоднее конкурентов, считает реальную прибыль с учётом всех удержаний Kaspi, склеивает накладные и
              собирает отзывы — пока вы занимаетесь товаром.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className="rounded-xl bg-blue-600 px-6 py-3.5 font-semibold hover:bg-blue-500">
                Попробовать {TRIAL_DAYS} дня бесплатно
              </Link>
              <a href={ask} target="_blank" rel="noreferrer" className="rounded-xl border border-white/20 px-6 py-3.5 font-semibold hover:bg-white/10">
                Написать в WhatsApp
              </a>
            </div>
            <dl className="mt-10 grid grid-cols-3 gap-4 text-center">
              <div>
                <dt className="text-xs text-slate-400">бесплатно</dt>
                <dd className="text-2xl font-bold">{TRIAL_DAYS} дня</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">тарифы от</dt>
                <dd className="text-2xl font-bold">{money(Math.min(...PLANS.map((p) => p.pricePerMonth)))}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">работает</dt>
                <dd className="text-2xl font-bold">24/7</dd>
              </div>
            </dl>
          </div>

          {/* Образец кабинета */}
          <div className="self-center rounded-2xl border border-white/10 bg-white/5 p-5 shadow-2xl" aria-hidden>
            <div className="text-sm text-slate-400">Последние 7 дней</div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {[
                ['Выручка', '1 480 000 ₸'],
                ['Чистая прибыль', '312 400 ₸'],
                ['Заказов', '214'],
                ['На 1-м месте', '41 из 50'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-white/10 p-3">
                  <div className="text-xs text-slate-400">{label}</div>
                  <div className="mt-1 text-lg font-bold">{value}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              {[
                ['Массажёр для шеи', '−1 ₸ от №2', 'Топ 1'],
                ['Крем для лица 50 мл', 'мин. +5%: 4 120 ₸', 'Топ 1'],
                ['Набор кистей', 'ждёт проверки', '№2'],
              ].map(([name, hint, pos]) => (
                <div key={name} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
                  <span>{name}</span>
                  <span className="text-xs text-slate-400">{hint}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${pos === 'Топ 1' ? 'bg-emerald-500' : 'bg-red-500'}`}>{pos}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 text-right text-[10px] text-slate-500">пример экрана</div>
          </div>
        </div>
      </section>

      {/* Возможности */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-20">
        <h2 className="text-3xl font-extrabold md:text-4xl">Всё для магазина на Kaspi — в одном кабинете</h2>
        <p className="mt-3 max-w-2xl text-slate-600">Вместо таблиц, отдельного бота и ручных подсчётов — один сервис, который работает сам.</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-slate-200 p-5 transition hover:border-blue-400 hover:shadow-lg">
              <div className="text-3xl" aria-hidden>
                {f.icon}
              </div>
              <h3 className="mt-3 font-bold">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Почему SANQ */}
      <section className="bg-slate-950 text-white">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-3xl font-extrabold md:text-4xl">Почему SANQ, а не таблица и отдельный бот</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['Прибыль до тенге', 'Все удержания Kaspi по каждому заказу: комиссия категории, НДС, Kaspi Pay, доставка, налог.'],
              ['Расходы на 1 штуку', 'Себестоимость, комиссия, Kaspi Pay и доставка в расчёте на одну единицу товара.'],
              ['Демпинг без минуса', 'Минимальный порог «себестоимость + ваш %» с учётом всех удержаний Kaspi — робот не опустит цену ниже.'],
              ['Свои расходы', 'Реклама, упаковка, зарплата — в процентах, и они вычитаются из прибыли.'],
              ['Предзаказ в один клик', 'Товар не пропадает с витрины, даже когда закончился на складе.'],
              ['Сборка и накладные быстрее', 'Заказы сгруппированы по товару, накладные всего дня склеиваются в один файл одной кнопкой.'],
              ['Всё в одном', 'Робот, аналитика, накладные, сборка, предзаказ, отзывы и Telegram — один кабинет и одна оплата.'],
            ].map(([title, text]) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="font-bold text-blue-400">{title}</div>
                <p className="mt-2 text-sm text-slate-300">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <LandingShowcase />

      {/* Как начать */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-3xl font-extrabold md:text-4xl">Как начать</h2>
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-2xl border border-slate-200 p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 font-bold text-white">{i + 1}</div>
              <h3 className="mt-4 font-bold">{s.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Тарифы */}
      <section id="prices" className="scroll-mt-16 bg-slate-950 text-white">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="text-3xl font-extrabold md:text-4xl">Тарифы</h2>
          <p className="mt-3 text-slate-300">
            {TRIAL_DAYS} дня бесплатно со всеми функциями. Оплата помесячно — подключение через WhatsApp.
          </p>
          <div className="mt-10 grid gap-5 text-slate-900 md:grid-cols-2">
            {full.map((p) => (
              <PlanCard key={p.id} p={p} />
            ))}
          </div>
          <h3 className="mt-12 text-lg font-bold">Нужен только один раздел</h3>
          <div className="mt-4 grid gap-5 text-slate-900 md:grid-cols-2">
            {single.map((p) => (
              <PlanCard key={p.id} p={p} />
            ))}
          </div>
        </div>
      </section>

      {/* Вопросы */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-16 px-4 py-20">
        <h2 className="text-3xl font-extrabold md:text-4xl">Частые вопросы</h2>
        <div className="mt-8 divide-y divide-slate-200 rounded-2xl border border-slate-200">
          {FAQ.map((item) => (
            <details key={item.q} className="group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
                {item.q}
                <span className="text-slate-400 transition group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm text-slate-600">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Призыв */}
      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="rounded-3xl bg-blue-600 px-6 py-12 text-center text-white md:px-12">
          <h2 className="text-3xl font-extrabold">Попробуйте SANQ на своём магазине</h2>
          <p className="mt-3 text-blue-100">{TRIAL_DAYS} дня бесплатно. Без карты и обязательств.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/register" className="rounded-xl bg-white px-6 py-3.5 font-semibold text-blue-700 hover:bg-blue-50">
              Начать бесплатно
            </Link>
            <a href={ask} target="_blank" rel="noreferrer" className="rounded-xl border border-white/40 px-6 py-3.5 font-semibold hover:bg-white/10">
              Задать вопрос в WhatsApp
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-slate-500">
          <Logo />
          <span>Сервис для продавцов Kaspi.kz · © {new Date().getFullYear()} SANQ</span>
          <a href={ask} target="_blank" rel="noreferrer" className="hover:text-slate-900">
            WhatsApp
          </a>
        </div>
      </footer>
    </div>
  );
}
