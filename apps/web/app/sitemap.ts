import type { MetadataRoute } from 'next';

const languages = { ru: 'https://sanq.kz', kk: 'https://sanq.kz/kz' };

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://sanq.kz', changeFrequency: 'weekly', priority: 1, alternates: { languages } },
    { url: 'https://sanq.kz/kz', changeFrequency: 'weekly', priority: 0.9, alternates: { languages } },
    { url: 'https://sanq.kz/register', changeFrequency: 'monthly', priority: 0.5 },
  ];
}
