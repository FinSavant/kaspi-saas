import { apiHeaders } from '@/lib/api';
const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/** Склейки нескольких магазинов одним PDF через api: ключ доступа остаётся на сервере. */
export async function GET(request: Request) {
  const ids = new URL(request.url).searchParams.get('ids') ?? '';
  const res = await fetch(`${API_URL}/waybill-batches/combined/pdf?ids=${encodeURIComponent(ids)}`, {
    headers: await apiHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) return new Response('Файл не найден', { status: res.status });

  return new Response(res.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': res.headers.get('content-disposition') ?? 'attachment; filename="waybills.pdf"',
    },
  });
}
