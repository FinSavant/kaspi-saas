import type { Metadata } from 'next';
import { Landing } from '@/components/Landing';
import { LANDING_TEXT } from '@/lib/landing-text';

const t = LANDING_TEXT.kk;

export const metadata: Metadata = {
  title: t.meta.title,
  description: t.meta.description,
  alternates: { canonical: 'https://sanq.kz/kz', languages: { ru: 'https://sanq.kz', kk: 'https://sanq.kz/kz', 'x-default': 'https://sanq.kz' } },
  openGraph: { title: t.meta.ogTitle, description: t.meta.ogDescription, url: 'https://sanq.kz/kz', siteName: 'SANQ', locale: 'kk_KZ', type: 'website' },
};

/** Страница о сервисе на казахском — видна всем, в том числе вошедшим продавцам. */
export default function KazakhLandingPage() {
  return <Landing lang="kk" />;
}
