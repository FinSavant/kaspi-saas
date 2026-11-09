import { describe, expect, it } from 'vitest';
import {
  buildModelPrompt,
  classifyGroup,
  collectBuyerQuestion,
  decideAction,
  detectLanguage,
  escalationText,
  findKnowledge,
  isOrderGroup,
  isPureGreeting,
  isSensitive,
  needsReply,
  parseModelAnswer,
  scrubForMemory,
  similarity,
  underHourlyLimit,
  validateAnswer,
} from './chatAgent';

const enabledAt = new Date('2026-11-09T10:00:00Z');
const after = enabledAt.getTime() + 60_000;

describe('classifyGroup / isOrderGroup', () => {
  it('PRODUCTS → диалог по товару, order_id = masterSku', () => {
    expect(classifyGroup({ tags: ['PRODUCTS'], analytics: { order_id: '142551991' } })).toEqual({ kind: 'PRODUCT', key: '142551991' });
  });
  it('ORDERS и отсутствие тегов → диалог по заказу', () => {
    expect(classifyGroup({ tags: ['ORDERS'], analytics: { order_id: '4849999999' } })?.kind).toBe('ORDER');
    expect(classifyGroup({ analytics: { order_id: 123 } })).toEqual({ kind: 'ORDER', key: '123' });
  });
  it('без order_id — не классифицируется', () => {
    expect(classifyGroup({ tags: ['ORDERS'], analytics: {} })).toBeNull();
    expect(classifyGroup({ tags: ['ORDERS'] })).toBeNull();
  });
  it('рассылка отзывов видит только заказы', () => {
    expect(isOrderGroup({ tags: ['PRODUCTS'], analytics: { order_id: '1' } })).toBe(false);
    expect(isOrderGroup({ tags: ['ORDERS'], analytics: { order_id: '1' } })).toBe(true);
  });
});

describe('needsReply', () => {
  const base = { lastMessage: { id: 'm1', created: after, sender: 'messenger' } };
  it('последним написал покупатель, сообщение новое и необработанное', () => {
    expect(needsReply(base, { enabledAt, handledMessageIds: new Set() })).toBe(true);
  });
  it('не отвечает на свои сообщения (sender=client)', () => {
    expect(needsReply({ lastMessage: { id: 'm1', created: after, sender: 'client' } }, { enabledAt, handledMessageIds: new Set() })).toBe(false);
  });
  it('не отвечает дважды на одно сообщение', () => {
    expect(needsReply(base, { enabledAt, handledMessageIds: new Set(['m1']) })).toBe(false);
  });
  it('старые сообщения до включения агента не трогает', () => {
    expect(needsReply({ lastMessage: { id: 'm1', created: enabledAt.getTime() - 1, sender: 'messenger' } }, { enabledAt, handledMessageIds: new Set() })).toBe(false);
  });
  it('нет сообщения или id — пропускает', () => {
    expect(needsReply({}, { enabledAt, handledMessageIds: new Set() })).toBe(false);
    expect(needsReply({ lastMessage: { created: after, sender: 'messenger' } }, { enabledAt, handledMessageIds: new Set() })).toBe(false);
  });
});

describe('collectBuyerQuestion', () => {
  it('склеивает подряд идущие сообщения покупателя после последнего ответа магазина', () => {
    const q = collectBuyerQuestion([
      { id: '1', created: 1, sender: 'messenger', text: 'старое', messageType: 'TEXT' },
      { id: '2', created: 2, sender: 'client', text: 'ответ магазина', messageType: 'TEXT' },
      { id: '3', created: 3, sender: 'messenger', text: 'Добрый день', messageType: 'TEXT' },
      { id: '4', created: 4, sender: 'messenger', text: 'Есть ли в наличии?', messageType: 'TEXT' },
    ]);
    expect(q).toEqual({ text: 'Добрый день\nЕсть ли в наличии?', lastMessageId: '4', hasNonText: false });
  });
  it('порядок сообщений в ответе Kaspi не важен', () => {
    const q = collectBuyerQuestion([
      { id: '4', created: 4, sender: 'messenger', text: 'второе' },
      { id: '3', created: 3, sender: 'messenger', text: 'первое' },
    ]);
    expect(q?.text).toBe('первое\nвторое');
  });
  it('нет сообщений покупателя в конце → null', () => {
    expect(collectBuyerQuestion([{ id: '1', created: 1, sender: 'client', text: 'x' }])).toBeNull();
  });
  it('не текст помечается', () => {
    const q = collectBuyerQuestion([{ id: '1', created: 1, sender: 'messenger', text: '', messageType: 'IMAGE' }]);
    expect(q?.hasNonText).toBe(true);
  });
});

describe('язык, приветствие, чувствительные темы', () => {
  it('казахский и русский', () => {
    expect(detectLanguage('Сәлеметсіз бе, бар ма?')).toBe('kk');
    expect(detectLanguage('Здравствуйте, есть в наличии?')).toBe('ru');
  });
  it('чистое приветствие', () => {
    expect(isPureGreeting('Здравствуйте!')).toBe(true);
    expect(isPureGreeting('  добрый день ')).toBe(true);
    expect(isPureGreeting('Здравствуйте, есть ли красный?')).toBe(false);
  });
  it('жалобы, здоровье, возврат — всегда чувствительные', () => {
    for (const t of ['У меня аллергия, можно использовать?', 'Хочу возврат', 'Подскажите срок годности', 'Это просрочено, жалоба', 'при беременности можно?', 'обман какой-то']) {
      expect(isSensitive(t)).toBe(true);
    }
    expect(isSensitive('Какой объём баночки?')).toBe(false);
  });
});

describe('decideAction', () => {
  const q = (text: string, hasNonText = false) => ({ text, lastMessageId: '1', hasNonText });
  it('приветствие → без модели', () => {
    expect(decideAction(q('Здравствуйте'))).toEqual({ type: 'greeting', lang: 'ru' });
  });
  it('чувствительное → эскалация, модель не вызывается', () => {
    expect(decideAction(q('У меня аллергия, подойдёт?'))).toEqual({ type: 'escalate', lang: 'ru', reason: 'sensitive' });
  });
  it('картинка без текста → эскалация', () => {
    expect(decideAction(q('', true))).toEqual({ type: 'escalate', lang: 'ru', reason: 'non-text' });
  });
  it('обычный вопрос → модель', () => {
    expect(decideAction(q('Какой вес?'))).toEqual({ type: 'ask-model', lang: 'ru' });
  });
});

describe('validateAnswer / parseModelAnswer', () => {
  it('принимает короткий нормальный ответ', () => {
    expect(validateAnswer('Объём — 250 мл.')).toBe('Объём — 250 мл.');
  });
  it('отклоняет пустое, слишком длинное и обещания', () => {
    expect(validateAnswer('')).toBeNull();
    expect(validateAnswer('а'.repeat(701))).toBeNull();
    expect(validateAnswer('Мы вернём деньги в течение дня.')).toBeNull();
    expect(validateAnswer('Дадим скидку 10%')).toBeNull();
    expect(validateAnswer('Срок годности 2 года')).toBeNull();
    expect(validateAnswer(null)).toBeNull();
  });
  it('разбирает JSON и вырезает мусор вокруг', () => {
    expect(parseModelAnswer('```json\n{"answer":"Да, в наличии.","source":"product"}\n```')).toEqual({ answer: 'Да, в наличии.', source: 'product' });
  });
  it('answer null или кривой JSON → null (эскалация)', () => {
    expect(parseModelAnswer('{"answer":null,"source":null}')).toBeNull();
    expect(parseModelAnswer('не знаю')).toBeNull();
    expect(parseModelAnswer('{"answer": "oops"')).toBeNull();
  });
});

describe('память: similarity / findKnowledge', () => {
  const entries = [
    { id: '1', question: 'Подходит ли для жирной кожи?', answer: 'Да, подходит.', masterSku: '111' },
    { id: '2', question: 'Сколько граммов в упаковке?', answer: '100 г.', masterSku: null },
    { id: '3', question: 'Подходит ли для сухой кожи?', answer: 'Нет.', masterSku: '222' },
  ];
  it('похожие вопросы близки, разные — далеки', () => {
    expect(similarity('Подходит для жирной кожи?', 'Подходит ли для жирной кожи?')).toBeGreaterThan(0.6);
    expect(similarity('Какой цвет?', 'Сколько граммов в упаковке?')).toBe(0);
  });
  it('находит запись по тому же товару и не берёт запись чужого товара', () => {
    const found = findKnowledge('А для жирной кожи подойдёт?', entries, { masterSku: '111' });
    expect(found.map((e) => e.id)).toEqual(['1']);
  });
  it('общая запись (без товара) подходит любому товару', () => {
    const found = findKnowledge('Сколько грамм в упаковке', entries, { masterSku: '222' });
    expect(found[0]?.id).toBe('2');
  });
  it('ничего похожего — пусто', () => {
    expect(findKnowledge('Когда привезёте в Астану?', entries, { masterSku: '111' })).toEqual([]);
  });
});

describe('лимит, подсказка модели, эскалация, обезличивание', () => {
  it('лимит ответов в час', () => {
    expect(underHourlyLimit(7, 8)).toBe(true);
    expect(underHourlyLimit(8, 8)).toBe(false);
  });
  it('промпт содержит только источники и вопрос', () => {
    const prompt = buildModelPrompt({
      question: 'Какой объём?',
      turns: [{ role: 'buyer', text: 'Какой объём?' }],
      lang: 'ru',
      shopName: 'ZAYN',
      product: { name: 'Крем', description: 'Объём 50 мл', specifications: [{ features: [{ name: 'Объём', featureValues: [{ value: '50 мл' }] }] }] },
      order: null,
      knowledge: [{ question: 'Срок?', answer: 'Не знаю' }],
    });
    expect(prompt).toContain('ТОВАР: Крем');
    expect(prompt).toContain('Объём: 50 мл');
    expect(prompt).toContain('ОТВЕТЫ ВЛАДЕЛЬЦА');
    expect(prompt).toContain('ВОПРОС ПОКУПАТЕЛЯ:\nКакой объём?');
  });
  it('текст эскалации объясняет, как ответить', () => {
    const text = escalationText({ shopName: 'ZAYN', productName: 'Крем', question: 'Есть ли пробник?', reason: 'no-answer' });
    expect(text).toContain('Товар: Крем');
    expect(text).toContain('Есть ли пробник?');
    expect(text).toContain('реплаем');
  });
  it('обезличивание вопроса для памяти', () => {
    expect(scrubForMemory('Заказ 4849999999, звоните +7 707 123-45-67')).toBe('Заказ [номер], звоните [номер]');
  });
});
