import { PLANS, REVIEWS_ADDON_PRICE, TRIAL_DAYS, type Plan } from '@kaspi/core/plans';
import Link from 'next/link';
import { LANDING_TEXT, LANDING_URL, type Lang, type LandingText } from '@/lib/landing-text';
import { LandingShowcase } from './LandingShowcase';
import { Logo } from './Logo';

/**
 * Открытая страница sanq.kz для тех, кто пришёл из поиска: что умеет SANQ, тарифы и
 * связь в WhatsApp. Есть на русском (/) и казахском (/kz). Вошедший продавец на «/»
 * её не видит — его сразу ведёт в кабинет.
 */

const money = (n: number) => `${n.toLocaleString('ru-RU')} ₸`;

function whatsapp(text: string): string {
  const number = (process.env.SANQ_WHATSAPP ?? '').replace(/\D/g, '');
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : '/register';
}

function planLines(p: Plan, t: LandingText): string[] {
  const pr = t.prices;
  if (p.single) return p.features.includes('reviews') ? pr.singleReviews : pr.singleAnalytics;
  return [
    pr.shops(p.maxShops),
    pr.robot(p.maxRobotProducts),
    pr.preorder(p.maxPreorderProducts),
    pr.base,
    p.reviewsIncluded ? pr.reviewsIncluded : pr.reviewsAddon(REVIEWS_ADDON_PRICE),
  ];
}

function PlanCard({ p, t }: { p: Plan; t: LandingText }) {
  const popular = p.id === 'pro';
  const name = t.prices.planName[p.id] ?? p.name;
  return (
    <div className={`flex flex-col rounded-2xl border p-6 ${popular ? 'border-blue-500 bg-blue-600 text-white shadow-xl shadow-blue-600/20' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold">{name}</h3>
        {popular && <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold">{t.prices.popular}</span>}
      </div>
      <div className="mt-3 text-3xl font-extrabold">
        {money(p.pricePerMonth)}
        <span className={`text-sm font-normal ${popular ? 'text-blue-100' : 'text-slate-500'}`}>{t.prices.perMonth}</span>
      </div>
      <ul className={`mt-5 flex-1 space-y-2 text-sm ${popular ? 'text-blue-50' : 'text-slate-700'}`}>
        {planLines(p, t).map((line) => (
          <li key={line} className="flex gap-2">
            <span aria-hidden>✓</span>
            {line}
          </li>
        ))}
      </ul>
      <a
        href={whatsapp(t.wa.plan(name, p.pricePerMonth))}
        target="_blank"
        rel="noreferrer"
        className={`mt-6 rounded-xl px-4 py-3 text-center text-sm font-semibold ${
          popular ? 'bg-white text-blue-700 hover:bg-blue-50' : 'bg-slate-900 text-white hover:bg-slate-700'
        }`}
      >
        {t.prices.connect}
      </a>
    </div>
  );
}

/** РУ / ҚАЗ в шапке. */
function LangSwitch({ lang, t }: { lang: Lang; t: LandingText }) {
  return (
    <div className="flex rounded-lg border border-white/20 p-0.5 text-xs font-semibold" role="group" aria-label={t.switcher.label}>
      {(['ru', 'kk'] as const).map((l) => (
        <Link
          key={l}
          href={LANDING_URL[l]}
          hrefLang={l}
          aria-current={l === lang ? 'true' : undefined}
          className={`rounded-md px-2 py-1 ${l === lang ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'}`}
        >
          {t.switcher[l]}
        </Link>
      ))}
    </div>
  );
}

export function Landing({ lang = 'ru' }: { lang?: Lang }) {
  const t = LANDING_TEXT[lang];
  const full = PLANS.filter((p) => !p.single);
  const single = PLANS.filter((p) => p.single);
  const ask = whatsapp(t.wa.ask);
  const url = `https://sanq.kz${lang === 'ru' ? '' : LANDING_URL[lang]}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'SANQ',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url,
    description: t.meta.jsonLdDescription,
    offers: PLANS.map((p) => ({ '@type': 'Offer', name: t.prices.planName[p.id] ?? p.name, price: p.pricePerMonth, priceCurrency: 'KZT' })),
    areaServed: 'KZ',
    inLanguage: lang,
  };
  // Вопросы-ответы в разметке schema.org — их читают поиск и ИИ-помощники
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: lang,
    mainEntity: t.faq.items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };

  return (
    <div lang={t.htmlLang} className="bg-white text-slate-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />

      {/* Шапка */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Logo dark />
          <nav className="hidden items-center gap-6 text-sm text-slate-300 lg:flex">
            <a href="#features" className="hover:text-white">{t.nav.features}</a>
            <a href="#analytics" className="hover:text-white">{t.nav.analytics}</a>
            <a href="#robot" className="hover:text-white">{t.nav.robot}</a>
            <a href="#prices" className="hover:text-white">{t.nav.prices}</a>
            <a href="#faq" className="hover:text-white">{t.nav.faq}</a>
          </nav>
          <div className="flex items-center gap-2">
            <LangSwitch lang={lang} t={t} />
            <Link href="/login" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-200 hover:text-white sm:block">
              {t.nav.login}
            </Link>
            <Link href="/register" className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500">
              {t.nav.try}
            </Link>
          </div>
        </div>
      </header>

      {/* Первый экран */}
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div className="pointer-events-none absolute -top-40 right-0 h-[32rem] w-[32rem] rounded-full bg-blue-600/30 blur-3xl" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
          <div>
            <div className="text-xs font-semibold tracking-[0.3em] text-blue-400">{t.hero.kicker}</div>
            <h1 className="mt-4 text-4xl leading-tight font-extrabold md:text-5xl">
              {t.hero.titleStart}
              <span className="text-blue-500">{t.hero.titleAccent}</span>
              {t.hero.titleEnd}
            </h1>
            <p className="mt-5 text-lg text-slate-300">{t.hero.lead}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className="rounded-xl bg-blue-600 px-6 py-3.5 font-semibold hover:bg-blue-500">
                {t.hero.tryFree(TRIAL_DAYS)}
              </Link>
              <a href={ask} target="_blank" rel="noreferrer" className="rounded-xl border border-white/20 px-6 py-3.5 font-semibold hover:bg-white/10">
                {t.hero.whatsapp}
              </a>
            </div>
            <dl className="mt-10 grid grid-cols-3 gap-4 text-center">
              <div>
                <dt className="text-xs text-slate-400">{t.hero.statFree}</dt>
                <dd className="text-2xl font-bold">{t.hero.statDays(TRIAL_DAYS)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">{t.hero.statFrom}</dt>
                <dd className="text-2xl font-bold">{money(Math.min(...PLANS.map((p) => p.pricePerMonth)))}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">{t.hero.statWorks}</dt>
                <dd className="text-2xl font-bold">24/7</dd>
              </div>
            </dl>
          </div>

          {/* Образец кабинета */}
          <div className="self-center rounded-2xl border border-white/10 bg-white/5 p-5 shadow-2xl" aria-hidden>
            <div className="text-sm text-slate-400">{t.mock.period}</div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {t.mock.tiles.map(([label, value]) => (
                <div key={label} className="rounded-xl bg-white/10 p-3">
                  <div className="text-xs text-slate-400">{label}</div>
                  <div className="mt-1 text-lg font-bold">{value}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              {t.mock.rows.map(([name, hint, pos]) => (
                <div key={name} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm">
                  <span>{name}</span>
                  <span className="text-xs text-slate-400">{hint}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${pos === t.mock.top ? 'bg-emerald-500' : 'bg-red-500'}`}>{pos}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 text-right text-[10px] text-slate-500">{t.mock.note}</div>
          </div>
        </div>
      </section>

      {/* Возможности */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-20">
        <h2 className="text-3xl font-extrabold md:text-4xl">{t.features.title}</h2>
        <p className="mt-3 max-w-2xl text-slate-600">{t.features.lead}</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {t.features.items.map((f) => (
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
          <h2 className="text-3xl font-extrabold md:text-4xl">{t.why.title}</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {t.why.items.map(([title, text]) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="font-bold text-blue-400">{title}</div>
                <p className="mt-2 text-sm text-slate-300">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <LandingShowcase t={t} />

      {/* Как начать */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-3xl font-extrabold md:text-4xl">{t.steps.title}</h2>
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {t.steps.items.map((s, i) => (
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
          <h2 className="text-3xl font-extrabold md:text-4xl">{t.prices.title}</h2>
          <p className="mt-3 text-slate-300">{t.prices.lead(TRIAL_DAYS)}</p>
          <div className="mt-10 grid gap-5 text-slate-900 md:grid-cols-2">
            {full.map((p) => (
              <PlanCard key={p.id} p={p} t={t} />
            ))}
          </div>
          <h3 className="mt-12 text-lg font-bold">{t.prices.single}</h3>
          <div className="mt-4 grid gap-5 text-slate-900 md:grid-cols-2">
            {single.map((p) => (
              <PlanCard key={p.id} p={p} t={t} />
            ))}
          </div>
        </div>
      </section>

      {/* Вопросы */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-16 px-4 py-20">
        <h2 className="text-3xl font-extrabold md:text-4xl">{t.faq.title}</h2>
        <div className="mt-8 divide-y divide-slate-200 rounded-2xl border border-slate-200">
          {t.faq.items.map((item) => (
            <details key={item.q} className="group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
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
          <h2 className="text-3xl font-extrabold">{t.cta.title}</h2>
          <p className="mt-3 text-blue-100">{t.cta.lead(TRIAL_DAYS)}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/register" className="rounded-xl bg-white px-6 py-3.5 font-semibold text-blue-700 hover:bg-blue-50">
              {t.cta.start}
            </Link>
            <a href={ask} target="_blank" rel="noreferrer" className="rounded-xl border border-white/40 px-6 py-3.5 font-semibold hover:bg-white/10">
              {t.cta.ask}
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-slate-500">
          <Logo />
          <span>
            {t.footer} · © {new Date().getFullYear()} SANQ
          </span>
          <div className="flex items-center gap-4">
            <Link href={LANDING_URL[lang === 'ru' ? 'kk' : 'ru']} hrefLang={lang === 'ru' ? 'kk' : 'ru'} className="hover:text-slate-900">
              {lang === 'ru' ? 'Қазақша' : 'Русский'}
            </Link>
            <a href={ask} target="_blank" rel="noreferrer" className="hover:text-slate-900">
              WhatsApp
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
