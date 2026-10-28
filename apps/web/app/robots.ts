import type { MetadataRoute } from 'next';

/** Поисковикам открыта только страница о сервисе; кабинет продавцов — нет. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: ['/$', '/register'], disallow: ['/shops', '/admin', '/expired', '/api'] },
    sitemap: 'https://sanq.kz/sitemap.xml',
    host: 'https://sanq.kz',
  };
}
