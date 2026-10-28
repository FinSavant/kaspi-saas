import { apiHeaders } from '@/lib/api';
const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/** Накладная одного заказа через api: ключ доступа к api остаётся на сервере. */
export async function GET(_request: Request, { params }: { params: Promise<{ shopId: string; code: string }> }) {
  const { shopId, code } = await params;
  const res = await fetch(`${API_URL}/shops/${encodeURIComponent(shopId)}/orders/${encodeURIComponent(code)}/waybill`, {
    headers: await apiHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    return new Response(payload?.error ?? 'Накладная не найдена', { status: res.status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  return new Response(res.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': res.headers.get('content-disposition') ?? `inline; filename="waybill-${code}.pdf"`,
    },
  });
}
