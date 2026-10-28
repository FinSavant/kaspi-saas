import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://sanq.kz', changeFrequency: 'weekly', priority: 1 },
    { url: 'https://sanq.kz/register', changeFrequency: 'monthly', priority: 0.5 },
  ];
}
