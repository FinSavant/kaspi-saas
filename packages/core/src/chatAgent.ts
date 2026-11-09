/**
 * Чистая логика агента-ответчика в чате Kaspi: разбор диалогов, выбор действия, безопасность
 * ответов, поиск похожих вопросов в памяти. Сеть, база и Claude — в apps/worker/src/jobs/chatAgent.ts.
 */

export type ChatGroupKind = 'PRODUCT' | 'ORDER';
export type ChatLang = 'ru' | 'kk';

export interface ChatGroupLike {
  id?: unknown;
  tags?: unknown;
  gts?: unknown;
  title?: unknown;
  analytics?: { order_id?: unknown } | null;
  lastMessage?: { id?: unknown; created?: unknown; sender?: unknown; messageType?: unknown } | null;
}

export interface ChatMessageLike {
  id?: unknown;
  created?: unknown;
  sender?: unknown;
  text?: unknown;
  messageType?: unknown;
  isDeleted?: unknown;
}

/** Покупатель в чате Kaspi — sender "messenger", магазин — "client". */
export const BUYER_SENDER = 'messenger';
export const SHOP_SENDER = 'client';

/**
 * Тип диалога: tags[0] — PRODUCTS (вопрос до заказа, analytics.order_id = masterSku товара)
 * или ORDERS (analytics.order_id = номер заказа). Без тегов считаем диалогом по заказу.
 */
export function classifyGroup(group: ChatGroupLike): { kind: ChatGroupKind; key: string } | null {
  const key = group.analytics?.order_id;
  if (key === undefined || key === null || String(key) === '') return null;
  const tags = Array.isArray(group.tags) ? group.tags.map(String) : [];
  const kind: ChatGroupKind = tags[0] === 'PRODUCTS' || (tags.includes('PRODUCTS') && !tags.includes('ORDERS')) ? 'PRODUCT' : 'ORDER';
  return { kind, key: String(key) };
}

/** Для рассылки отзывов: заказом считается всё, кроме товарных диалогов. */
export function isOrderGroup(group: ChatGroupLike): boolean {
  return classifyGroup(group)?.kind === 'ORDER';
}

/**
 * Диалог ждёт ответа, если последним написал покупатель, сообщение новее момента включения
 * агента и мы его ещё не обрабатывали.
 */
export function needsReply(group: ChatGroupLike, opts: { enabledAt: Date; handledMessageIds: ReadonlySet<string> }): boolean {
  const last = group.lastMessage;
  if (!last || last.sender !== BUYER_SENDER) return false;
  const id = last.id === undefined || last.id === null ? '' : String(last.id);
  if (!id || opts.handledMessageIds.has(id)) return false;
  const created = Number(last.created);
  if (Number.isFinite(created) && created < opts.enabledAt.getTime()) return false;
  return true;
}

export interface BuyerQuestion {
  text: string;
  /** id последнего сообщения покупателя */
  lastMessageId: string;
  /** Есть ли не текстовое сообщение (фото, файл) — их читать не умеем */
  hasNonText: boolean;
}

/**
 * Вопрос покупателя — его последние сообщения подряд после последнего сообщения магазина
 * (не больше `max`), от старых к новым.
 */
export function collectBuyerQuestion(messages: readonly ChatMessageLike[], max = 5): BuyerQuestion | null {
  const sorted = messages.filter((m) => !m.isDeleted).sort((a, b) => Number(b.created) - Number(a.created));
  const tail: ChatMessageLike[] = [];
  for (const m of sorted) {
    if (m.sender !== BUYER_SENDER) break;
    tail.push(m);
    if (tail.length >= max) break;
  }
  if (tail.length === 0) return null;
  tail.reverse();
  const texts = tail.map((m) => (typeof m.text === 'string' ? m.text.trim() : '')).filter(Boolean);
  const hasNonText = tail.some((m) => m.messageType !== undefined && m.messageType !== 'TEXT');
  return { text: texts.join('\n').slice(0, 1500), lastMessageId: String(tail[tail.length - 1]!.id ?? ''), hasNonText };
}

/** Последние реплики диалога для контекста модели: от старых к новым. */
export function recentTurns(messages: readonly ChatMessageLike[], max = 6): { role: 'buyer' | 'shop'; text: string }[] {
  return messages
    .filter((m) => !m.isDeleted && typeof m.text === 'string' && m.text.trim())
    .sort((a, b) => Number(b.created) - Number(a.created))
    .slice(0, max)
    .reverse()
    .map((m) => ({ role: m.sender === BUYER_SENDER ? ('buyer' as const) : ('shop' as const), text: String(m.text).trim().slice(0, 500) }));
}

const KAZAKH_LETTERS = /[әғқңөұүһі]/i;
const KAZAKH_WORDS = /(сәлем|салем|рақмет|рахмет|қанша|қалай|бар ма|жоқ|керек|болады|қашан|неше|жеткізу|сау болыңыз)/i;

export function detectLanguage(text: string): ChatLang {
  return KAZAKH_LETTERS.test(text) || KAZAKH_WORDS.test(text) ? 'kk' : 'ru';
}

export const HOLDING_MESSAGE: Record<ChatLang, string> = {
  ru: 'Здравствуйте! Секунду, уточню и отвечу.',
  kk: 'Сәлеметсіз бе! Бір секунд, нақтылап, жауап беремін.',
};

export const GREETING_REPLY: Record<ChatLang, string> = {
  ru: 'Здравствуйте! Чем могу помочь?',
  kk: 'Сәлеметсіз бе! Қалай көмектесе аламын?',
};

const GREETING = /^[\s!.,)(:;-]*(здравствуйте|здраствуйте|здрасте|здравствуй|привет|приветствую|добрый\s+(день|вечер|утро)|доброго\s+времени\s+суток|салем|салам|сәлем|сәлеметсіз\s*бе|ассалаума?\s*алейкум|hello|hi|hey|добрый)[\s!.,)(:;-]*$/i;

/** Одно приветствие без вопроса — отвечаем приветствием сразу, без модели. */
export function isPureGreeting(text: string): boolean {
  return GREETING.test(text.trim());
}

/**
 * Темы, где агент никогда не отвечает сам: жалобы, здоровье, аллергия, возврат, деньги,
 * угрозы, претензии. Покупателю — нейтральное «уточню», владельцу — вопрос.
 */
const SENSITIVE =
  /(жалоб|претензи|обман|мошенн|развод|верните|возврат|вернуть\s+(деньги|товар)|возмести|компенсац|скидк|бонус|аллерг|сыпь|сып[ьи]т|покраснен|ожог|раздражен|отравл|тошнит|беремен|кормящ|врач|больниц|здоровь|побочк|побочн|противопоказ|суд\b|прокурат|полици|роспотреб|защит[аы]\s+прав|испорчен|просрочен|срок\s+годност|подделк|контрафакт|фальсиф|не\s+оригинал|отмени(ть)?\s+заказ|отказ(ываюсь|аться)|плохой\s+отзыв|негативн|кайтар|шағым|аллергия|денсаулық|дәрігер)/i;

export function isSensitive(text: string): boolean {
  return SENSITIVE.test(text);
}

/** Слова, которых не должно быть в сгенерированном ответе: обещания денег, возврата, сроков. */
const FORBIDDEN_IN_ANSWER =
  /(верн[её]м\s+деньги|возврат\s+средств|вернём|компенсир|скидк[ауие]|подарок|бесплатно|гарантир|обещаю|точно\s+доставим|будет\s+завтра|срок\s+годности|аллергии\s+не\s+(будет|вызывает)|безопасн[оы]\s+для\s+(беременн|детей)|лечит|излечива)/i;

/** Проверка ответа модели: пусто, слишком длинно или содержит запретные обещания → эскалация. */
export function validateAnswer(answer: unknown): string | null {
  if (typeof answer !== 'string') return null;
  const text = answer.trim();
  if (text.length < 2 || text.length > 700) return null;
  if (FORBIDDEN_IN_ANSWER.test(text)) return null;
  return text;
}

/** Нормализация вопроса для сравнения: нижний регистр, буквы/цифры, корни слов. */
export function questionTokens(text: string): string[] {
  const stop = new Set(['а', 'и', 'в', 'во', 'на', 'у', 'с', 'со', 'к', 'по', 'за', 'из', 'о', 'об', 'от', 'до', 'для', 'не', 'ни', 'но', 'же', 'ли', 'бы', 'это', 'как', 'что', 'или', 'мне', 'вам', 'вас', 'есть', 'ли', 'здравствуйте', 'добрый', 'день', 'пожалуйста', 'подскажите', 'скажите']);
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^a-zа-яәғқңөұүһі0-9]+/i)
    .filter((w) => w.length > 1 && !stop.has(w))
    .map((w) => (w.length > 5 ? w.slice(0, 5) : w));
}

export interface KnowledgeEntry {
  id: string;
  question: string;
  answer: string;
  masterSku?: string | null;
}

/** Сходство двух вопросов 0..1 (доля общих корней, мера Жаккара). */
export function similarity(a: string, b: string): number {
  const sa = new Set(questionTokens(a));
  const sb = new Set(questionTokens(b));
  if (sa.size === 0 || sb.size === 0) return 0;
  let common = 0;
  for (const t of sa) if (sb.has(t)) common++;
  return common / (sa.size + sb.size - common);
}

/**
 * Кандидаты из памяти для вопроса: сначала записи по тому же товару, потом общие;
 * внутри — по убыванию сходства. Порог отсекает случайные совпадения.
 */
export function findKnowledge(
  question: string,
  entries: readonly KnowledgeEntry[],
  opts: { masterSku?: string | null; min?: number; limit?: number } = {},
): (KnowledgeEntry & { score: number })[] {
  const min = opts.min ?? 0.25;
  return entries
    .filter((e) => !e.masterSku || !opts.masterSku || e.masterSku === opts.masterSku)
    .map((e) => ({ ...e, score: similarity(question, e.question) + (e.masterSku && e.masterSku === opts.masterSku ? 0.1 : 0) }))
    .filter((e) => e.score >= min)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? 5);
}

/** Лимит ответов агента на один диалог в час — защита от зацикливания и спама. */
export function underHourlyLimit(repliesLastHour: number, max: number): boolean {
  return repliesLastHour < max;
}

export type AgentAction =
  | { type: 'greeting'; lang: ChatLang }
  | { type: 'escalate'; lang: ChatLang; reason: 'sensitive' | 'non-text' | 'no-text' | 'no-answer' }
  | { type: 'ask-model'; lang: ChatLang };

/** Первый выбор до обращения к модели. */
export function decideAction(question: BuyerQuestion): AgentAction {
  const lang = detectLanguage(question.text);
  if (question.hasNonText && !question.text) return { type: 'escalate', lang, reason: 'non-text' };
  if (!question.text) return { type: 'escalate', lang, reason: 'no-text' };
  if (isPureGreeting(question.text)) return { type: 'greeting', lang };
  if (isSensitive(question.text)) return { type: 'escalate', lang, reason: 'sensitive' };
  return { type: 'ask-model', lang };
}

export interface ModelContext {
  question: string;
  turns: { role: 'buyer' | 'shop'; text: string }[];
  lang: ChatLang;
  shopName: string;
  product?: { name: string; description?: string | null; specifications?: unknown } | null;
  order?: { status: string; plannedDeliveryDate?: string | null; items: string[] } | null;
  knowledge: { question: string; answer: string }[];
}

export const MODEL_SYSTEM_PROMPT = [
  'Ты — вежливый помощник продавца на Kaspi.kz, отвечаешь покупателю в чате от имени магазина.',
  'Отвечай ТОЛЬКО на основе блоков «ТОВАР», «ЗАКАЗ» и «ОТВЕТЫ ВЛАДЕЛЬЦА». Ответы владельца — самый надёжный источник.',
  'Никогда не придумывай состав, свойства, сроки годности, наличие, сроки доставки, цены. Не обещай возврат, скидки, подарки, компенсации.',
  'Если ответа в источниках нет или ты не уверен — верни {"answer": null}.',
  'Отвечай на языке покупателя (русский или казахский), коротко (1–3 предложения), без выдуманных деталей, без эмодзи-спама.',
  'Формат ответа — строго JSON одной строкой: {"answer": "<текст>" | null, "source": "product" | "order" | "owner" | null}. Ничего кроме JSON.',
].join('\n');

function specLines(specs: unknown): string {
  if (!Array.isArray(specs)) return '';
  const lines: string[] = [];
  for (const group of specs) {
    const features = Array.isArray(group?.features) ? group.features : [];
    for (const f of features) {
      const name = f?.name ?? f?.title;
      const value = Array.isArray(f?.featureValues) ? f.featureValues.map((v: any) => v?.value ?? v?.name ?? v).join(', ') : (f?.value ?? f?.values);
      if (name && value !== undefined) lines.push(`${name}: ${Array.isArray(value) ? value.join(', ') : String(value)}`);
    }
  }
  // Формат характеристик в кабинете известен только по именам ключей: если не разобрали — отдаём как есть
  return (lines.length ? lines.join('\n') : JSON.stringify(specs)).slice(0, 2500);
}

/** Запрос к модели одним сообщением: источники + диалог + вопрос. */
export function buildModelPrompt(ctx: ModelContext): string {
  const parts: string[] = [`Магазин: ${ctx.shopName}. Язык покупателя: ${ctx.lang === 'kk' ? 'казахский' : 'русский'}.`];
  if (ctx.product) {
    parts.push(`ТОВАР: ${ctx.product.name}`);
    if (ctx.product.description) parts.push(`Описание: ${ctx.product.description.slice(0, 3000)}`);
    const specs = specLines(ctx.product.specifications);
    if (specs) parts.push(`Характеристики:\n${specs}`);
    if (!ctx.product.description && !specs) parts.push('(описания и характеристик нет)');
  } else {
    parts.push('ТОВАР: не определён');
  }
  if (ctx.order) {
    parts.push(`ЗАКАЗ: статус ${ctx.order.status}${ctx.order.plannedDeliveryDate ? `, плановая дата доставки ${ctx.order.plannedDeliveryDate}` : ''}; позиции: ${ctx.order.items.join('; ')}`);
  }
  if (ctx.knowledge.length) {
    parts.push('ОТВЕТЫ ВЛАДЕЛЬЦА на похожие вопросы:\n' + ctx.knowledge.map((k, i) => `${i + 1}. Вопрос: ${k.question}\n   Ответ: ${k.answer}`).join('\n'));
  }
  if (ctx.turns.length > 1) {
    parts.push('Недавний диалог:\n' + ctx.turns.map((t) => `${t.role === 'buyer' ? 'Покупатель' : 'Магазин'}: ${t.text}`).join('\n'));
  }
  parts.push(`ВОПРОС ПОКУПАТЕЛЯ:\n${ctx.question}`);
  return parts.join('\n\n');
}

/** Разбор ответа модели: допустим только JSON с непустым answer, иначе эскалация. */
export function parseModelAnswer(raw: string): { answer: string; source: string | null } | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const json = JSON.parse(match[0]);
    const answer = validateAnswer(json?.answer);
    if (!answer) return null;
    return { answer, source: typeof json?.source === 'string' ? json.source : null };
  } catch {
    return null;
  }
}

/** Текст владельцу в Telegram: вопрос покупателя и как ответить. */
export function escalationText(p: { shopName: string; productName?: string | null; question: string; reason: string }): string {
  const why: Record<string, string> = {
    sensitive: 'тема требует вашего ответа',
    'non-text': 'покупатель прислал не текст (фото/файл)',
    'no-text': 'пустое сообщение',
    'no-answer': 'в описании и памяти ответа нет',
  };
  return [
    `❓ ${p.shopName}: вопрос покупателя`,
    p.productName ? `Товар: ${p.productName}` : null,
    `Причина: ${why[p.reason] ?? p.reason}`,
    '',
    p.question.slice(0, 1200),
    '',
    'Ответьте реплаем на это сообщение — ответ сразу уйдёт покупателю и запомнится.',
  ]
    .filter((l) => l !== null)
    .join('\n');
}

/** Ответ владельца обезличиваем для памяти: телефоны, номера заказов. */
export function scrubForMemory(text: string): string {
  return text
    .replace(/\+?\d[\d\s().-]{8,}\d/g, '[номер]')
    .replace(/\b\d{9,10}\b/g, '[номер]')
    .trim();
}
