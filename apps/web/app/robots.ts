import type { MetadataRoute } from 'next';

// Поисковики и ИИ-помощники (ChatGPT, Claude, Perplexity, Gemini) видят страницу о сервисе
// и llms.txt; кабинет продавцов закрыт для всех
const DISALLOW = ['/shops', '/admin', '/expired', '/api'];
const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: DISALLOW },
      { userAgent: AI_BOTS, allow: '/', disallow: DISALLOW },
    ],
    sitemap: 'https://sanq.kz/sitemap.xml',
    host: 'https://sanq.kz',
  };
}
