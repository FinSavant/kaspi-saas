import { apiHeaders } from '@/lib/api';
const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/** Отдаёт PDF склейки через api: ключ доступа к api остаётся на сервере. */
export async function GET(_request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const res = await fetch(`${API_URL}/waybill-batches/${encodeURIComponent(batchId)}/pdf`, {
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
