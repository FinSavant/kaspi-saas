import { describe, expect, it } from 'vitest';
import { buildPriceListXml } from './priceFeed';

describe('buildPriceListXml', () => {
  const xml = buildPriceListXml(
    {
      company: 'Shop & Co',
      merchantId: '12345',
      offers: [
        { sku: 'SKU-1', name: 'Чехол "Pro" <XL>', brand: 'Acme', price: 9_499, available: true },
        { sku: 'SKU-2', name: 'Кабель', price: 1_200.4, available: false, storeId: 'PP2' },
      ],
    },
    new Date('2026-01-01T00:00:00Z'),
  );

  it('escapes XML special characters', () => {
    expect(xml).toContain('<company>Shop &amp; Co</company>');
    expect(xml).toContain('<model>Чехол &quot;Pro&quot; &lt;XL&gt;</model>');
  });

  it('writes price and availability per offer', () => {
    expect(xml).toContain('<offer sku="SKU-1">');
    expect(xml).toContain('<price>9499</price>');
    expect(xml).toContain('<availability available="no" storeId="PP2"/>');
    expect(xml).toContain('<price>1200</price>');
  });

  it('omits the brand tag when there is no brand', () => {
    expect(xml.match(/<brand>/g)).toHaveLength(1);
  });
});
