import { describe, expect, it } from 'vitest';
import { DEFAULT_TEMPLATES, renderTemplate, reviewLink, withinHours } from './reviews';

const order = {
  code: '1099244985',
  customerName: 'Анна',
  plannedDeliveryDate: new Date('2026-10-08T10:00:00Z'),
  items: [
    { name: 'Хна мехенди красная', masterSku: '142551991' },
    { name: 'Товар без карточки', masterSku: null },
  ],
};
// 15:00 по Алматы
const afternoon = new Date('2026-10-05T10:00:00Z');

describe('renderTemplate', () => {
  it('fills every parameter of the new-order greeting', () => {
    const text = renderTemplate(DEFAULT_TEMPLATES.NEW_ORDER, order, 'ZAYN STORY', afternoon);
    expect(text).toContain('Қайырлы күн, Анна!');
    expect(text).toContain('Добрый день, Анна!');
    expect(text).toContain('№1099244985 принят: Хна мехенди красная, Товар без карточки');
    expect(text).toContain('Дата доставки: 08.10.2026');
    expect(text).toContain('ZAYN STORY');
    expect(text).not.toContain('@');
  });

  it('adds a 5-star review link only for products with a Kaspi card', () => {
    const text = renderTemplate(DEFAULT_TEMPLATES.REVIEW, order, 'ZAYN STORY', afternoon);
    expect(text).toContain(reviewLink('1099244985', '142551991'));
    expect(text.match(/productreview/g)).toHaveLength(2); // по ссылке в казахском и русском блоках
  });

  it('drops the comma when the customer name is unknown', () => {
    expect(renderTemplate('@Приветствие (ru), @Имя клиента!', { ...order, customerName: null }, 'X', afternoon)).toBe('Добрый день!');
  });
});

describe('withinHours', () => {
  it('respects the Almaty working window', () => {
    expect(withinHours(afternoon, 8, 23)).toBe(true);
    expect(withinHours(new Date('2026-10-05T19:00:00Z'), 8, 23)).toBe(false); // 00:00 Алматы
  });
});
