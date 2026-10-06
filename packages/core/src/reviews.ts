// Сообщения покупателю в чат Kaspi: приветствие после заказа и просьба об отзыве после
// выдачи. Шаблоны с параметрами через @, как в Okto; текст сразу на казахском и русском.

export type ReviewMessageKind = 'NEW_ORDER' | 'REVIEW';

export interface TemplateOrder {
  code: string;
  customerName: string | null;
  plannedDeliveryDate: Date | null;
  items: { name: string; masterSku: string | null }[];
}

/** Параметры шаблона: подпись для кнопки вставки и как она пишется в тексте. */
export const TEMPLATE_PARAMS = [
  { token: '@Приветствие (kz)', hint: 'Қайырлы таң / күн / кеш — по времени' },
  { token: '@Приветствие (ru)', hint: 'Доброе утро / день / вечер — по времени' },
  { token: '@Имя клиента', hint: 'Имя покупателя из заказа' },
  { token: '@Номер заказа', hint: 'Номер заказа Kaspi' },
  { token: '@Товары', hint: 'Названия товаров через запятую' },
  { token: '@Дата доставки', hint: 'Планируемая дата доставки' },
  { token: '@Название магазина', hint: 'Название магазина' },
  { token: '@Ссылки на отзыв', hint: 'Ссылка на отзыв с 5 звёздами для каждого товара' },
] as const;

export const DEFAULT_TEMPLATES: Record<ReviewMessageKind, string> = {
  NEW_ORDER: [
    '@Приветствие (kz), @Имя клиента!',
    '📦 Сіздің №@Номер заказа тапсырысыңыз қабылданды: @Товары',
    '🗓 Жеткізу күні: @Дата доставки',
    '🙏 Бізді таңдағаныңыз үшін рахмет!',
    '@Название магазина',
    '',
    '@Приветствие (ru), @Имя клиента!',
    '📦 Ваш заказ №@Номер заказа принят: @Товары',
    '🗓 Дата доставки: @Дата доставки',
    '🙏 Спасибо, что выбрали нас!',
    '@Название магазина',
  ].join('\n'),
  REVIEW: [
    '😊 Сізге бәрі ұнады деп үміттенеміз!',
    'Kaspi-де пікір қалдырсаңыз, біз үшін үлкен көмек болады ⭐⭐⭐⭐⭐',
    '@Ссылки на отзыв',
    'Рахмет!',
    '',
    '😊 Надеемся, вам всё понравилось!',
    'Если не сложно, оставьте, пожалуйста, отзыв в Kaspi ⭐⭐⭐⭐⭐',
    '@Ссылки на отзыв',
    'Спасибо!',
  ].join('\n'),
};

/** Ссылка на страницу отзыва Kaspi с выставленными 5 звёздами. */
export const reviewLink = (orderCode: string, masterSku: string) =>
  `https://kaspi.kz/shop/review/productreview?orderCode=${encodeURIComponent(orderCode)}&productCode=${encodeURIComponent(masterSku)}&rating=5`;

/** Час по Алматы (UTC+5). */
export const almatyHour = (at: Date) => (at.getUTCHours() + 5) % 24;

function greeting(hour: number): { kz: string; ru: string } {
  if (hour >= 5 && hour < 12) return { kz: 'Қайырлы таң', ru: 'Доброе утро' };
  if (hour >= 12 && hour < 18) return { kz: 'Қайырлы күн', ru: 'Добрый день' };
  if (hour >= 18 && hour < 23) return { kz: 'Қайырлы кеш', ru: 'Добрый вечер' };
  return { kz: 'Қайырлы түн', ru: 'Доброй ночи' };
}

const dateRu = (d: Date) => {
  const local = new Date(d.getTime() + 5 * 60 * 60 * 1000);
  return `${String(local.getUTCDate()).padStart(2, '0')}.${String(local.getUTCMonth() + 1).padStart(2, '0')}.${local.getUTCFullYear()}`;
};

/** Подставляет параметры в шаблон. Пустые параметры убираются вместе с лишней запятой. */
export function renderTemplate(template: string, order: TemplateOrder, shopName: string, at: Date = new Date()): string {
  const hello = greeting(almatyHour(at));
  const links = order.items.filter((i) => i.masterSku).map((i) => reviewLink(order.code, i.masterSku!));
  const values: Record<string, string> = {
    '@Приветствие (kz)': hello.kz,
    '@Приветствие (ru)': hello.ru,
    '@Имя клиента': order.customerName ?? '',
    '@Номер заказа': order.code,
    '@Товары': order.items.map((i) => i.name).join(', '),
    '@Дата доставки': order.plannedDeliveryDate ? dateRu(order.plannedDeliveryDate) : '',
    '@Название магазина': shopName,
    '@Ссылки на отзыв': links.join('\n'),
  };
  let text = template;
  // Длинные параметры раньше коротких: «@Приветствие (kz)» не должен съесться другим
  for (const token of Object.keys(values).sort((a, b) => b.length - a.length)) text = text.split(token).join(values[token]!);
  return text
    .replace(/, !/g, '!') // «Добрый день, !» без имени
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Время рассылки по Алматы: from включительно, to — не включая. */
export function withinHours(at: Date, from: number, to: number): boolean {
  const h = almatyHour(at);
  return from <= to ? h >= from && h < to : h >= from || h < to;
}
