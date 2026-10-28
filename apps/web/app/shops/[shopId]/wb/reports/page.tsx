import { api } from '@/lib/api';
import { SyncWbButton, TaxForm, TokenForm } from '../forms';
import { ReportsTable, UploadBox, type ReportListItem } from '../ReportsClient';

export const dynamic = 'force-dynamic';

interface WbStatus {
  connected: boolean;
  hasToken: boolean;
  syncedAt?: string | null;
  syncError?: string | null;
  taxPercent?: number;
}

const dateTime = (iso: string) => new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty', dateStyle: 'short', timeStyle: 'short' });

export default async function WbReportsPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const [status, reports] = await Promise.all([api<WbStatus>(`/shops/${shopId}/wb`), api<ReportListItem[]>(`/shops/${shopId}/wb/reports`)]);

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-violet-700 via-fuchsia-600 to-pink-500 p-6 text-white shadow-lg">
        <div className="text-sm font-medium text-white/80">Wildberries</div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Отчёты о реализации</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/85">
          Еженедельные отчёты WB: продажи, возвраты, вознаграждение, логистика, хранение и штрафы — и ваша прибыль с учётом
          себестоимости. Отметьте несколько недель, чтобы получить сводный отчёт.
        </p>
      </div>

      <UploadBox shopId={shopId} />

      <ReportsTable shopId={shopId} reports={reports} />

      <details className="rounded-2xl border border-slate-200 bg-white p-5 text-sm">
        <summary className="cursor-pointer font-semibold">⚙️ Настройки Wildberries</summary>
        <div className="mt-4 space-y-5">
          <TaxForm shopId={shopId} taxPercent={status.taxPercent ?? 0} />
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <div className="font-medium">Автозагрузка через API WB</div>
            <p className="text-slate-600">
              {status.hasToken
                ? status.syncedAt
                  ? `Подключена. Последняя загрузка: ${dateTime(status.syncedAt)}.`
                  : 'Подключена, первая загрузка ещё не прошла.'
                : 'Не подключена — отчёты загружаются только файлами.'}{' '}
              Кабинет WB → Настройки → Доступ к API → «Создать новый токен»: тип <b>Персональный</b>, категория <b>Финансы</b>,
              «Только на чтение». С базовым токеном WB разрешает обновление только 2 раза в сутки.
            </p>
            {status.syncError && <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">{status.syncError}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <TokenForm shopId={shopId} replace={status.hasToken} />
              {status.hasToken && <SyncWbButton shopId={shopId} />}
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
