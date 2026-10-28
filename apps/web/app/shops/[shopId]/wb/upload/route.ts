import { apiHeaders } from '@/lib/api';
const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/**
 * Загрузка файлов отчётов WB со страницы «Отчёты»: файлы приходят формой и уходят в api
 * по одному (base64), ключ api остаётся на сервере.
 */
export async function POST(request: Request, { params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const form = await request.formData();
  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return Response.json({ error: 'Выберите файл отчёта.' }, { status: 400 });

  const results = [];
  for (const file of files) {
    const res = await fetch(`${API_URL}/shops/${encodeURIComponent(shopId)}/wb/reports/upload`, {
      method: 'POST',
      headers: { ...(await apiHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, data: Buffer.from(await file.arrayBuffer()).toString('base64') }),
      cache: 'no-store',
    });
    const payload = await res.json().catch(() => null);
    results.push(res.ok ? { file: file.name, reports: payload?.reports ?? [] } : { file: file.name, error: payload?.error ?? `Ошибка ${res.status}` });
  }
  return Response.json({ results });
}
