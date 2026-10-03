// Цены в Kaspi обновляются через прайс-лист в XML: продавец указывает ссылку
// на файл в кабинете, Kaspi сам периодически его забирает. Формат написан по
// общедоступной схеме kaspiShopping — сверьте его с актуальной документацией.

export interface PriceFeedOffer {
  sku: string;
  name: string;
  brand?: string | null;
  price: number;
  available: boolean;
  /** Код точки выдачи из кабинета продавца, например PP1. */
  storeId?: string;
}

export interface PriceFeed {
  company: string;
  merchantId: string;
  offers: PriceFeedOffer[];
}

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export function buildPriceListXml(feed: PriceFeed, date: Date = new Date()): string {
  const offers = feed.offers
    .map((offer) =>
      [
        `    <offer sku="${escapeXml(offer.sku)}">`,
        `      <model>${escapeXml(offer.name)}</model>`,
        offer.brand ? `      <brand>${escapeXml(offer.brand)}</brand>` : null,
        '      <availabilities>',
        `        <availability available="${offer.available ? 'yes' : 'no'}" storeId="${escapeXml(offer.storeId ?? 'PP1')}"/>`,
        '      </availabilities>',
        `      <price>${Math.round(offer.price)}</price>`,
        '    </offer>',
      ]
        .filter((line) => line !== null)
        .join('\n'),
    )
    .join('\n');

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<kaspi_catalog date="${date.toISOString()}" xmlns="kaspiShopping" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="kaspiShopping http://kaspi.kz/kaspishopping.xsd">`,
    `  <company>${escapeXml(feed.company)}</company>`,
    `  <merchantid>${escapeXml(feed.merchantId)}</merchantid>`,
    '  <offers>',
    offers,
    '  </offers>',
    '</kaspi_catalog>',
    '',
  ].join('\n');
}
