const FINANCE_URL = 'https://finance-api.wildberries.ru';

/** Строка «Отчёта о реализации» WB (reportDetailByPeriod), только нужные поля. */
export interface WbRealizationRow {
  rrdId: bigint;
  realizationreportId: bigint | null;
  nmId: bigint | null;
  saName: string | null;
  brand: string | null;
  /** Название товара из отчёта (или предмет, если названия нет). */
  subject: string | null;
  /** «Продажа», «Возврат» и т. п. */
  docType: string | null;
  /** «Продажа», «Логистика», «Хранение», «Штраф» и т. п. */
  operName: string | null;
  quantity: number;
  /** Сумма продажи покупателю (реализовано). */
  retailAmount: number;
  /** К перечислению продавцу за товар — после вознаграждения WB. */
  forPay: number;
  delivery: number;
  storage: number;
  penalty: number;
  acceptance: number;
  deduction: number;
  additionalPayment: number;
  currency: string | null;
  saleDate: Date | null;
  rrDate: Date | null;
  warehouse: string | null;
  saleMethod: string | null;
  /** Период отчёта, в который входит строка. */
  reportDateFrom: Date | null;
  reportDateTo: Date | null;
}

export class WbApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Через сколько секунд можно повторить (для 429). */
    readonly retryAfterSec: number | null = null,
  ) {
    super(message);
  }
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0)) || 0;
const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null);
const big = (v: unknown) => (v === null || v === undefined || v === '' || Number(v) === 0 ? null : BigInt(Math.trunc(Number(v))));
const date = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v) : null);

/** Строка нового метода WB (Финансы → детализация отчётов реализации), поля в camelCase; суммы — строками. */
export function mapWbRealizationRow(raw: any): WbRealizationRow {
  return {
    rrdId: BigInt(Math.trunc(Number(raw?.rrdId ?? 0))),
    realizationreportId: big(raw?.reportId),
    nmId: big(raw?.nmId),
    saName: str(raw?.vendorCode),
    brand: str(raw?.brandName),
    subject: str(raw?.title) ?? str(raw?.subjectName),
    docType: str(raw?.docTypeName),
    operName: str(raw?.sellerOperName),
    quantity: Math.trunc(num(raw?.quantity)),
    retailAmount: num(raw?.retailAmount),
    forPay: num(raw?.forPay),
    // Логистика и её перевыставление — обе удерживаются с продавца
    delivery: num(raw?.deliveryService) + num(raw?.rebillLogisticCost),
    storage: num(raw?.paidStorage),
    penalty: num(raw?.penalty),
    acceptance: num(raw?.paidAcceptance),
    deduction: num(raw?.deduction),
    additionalPayment: num(raw?.additionalPayment),
    currency: str(raw?.currency),
    saleDate: date(raw?.saleDt),
    rrDate: date(raw?.rrDate),
    warehouse: str(raw?.officeName),
    saleMethod: str(raw?.deliveryMethod),
    reportDateFrom: date(raw?.dateFrom),
    reportDateTo: date(raw?.dateTo),
  };
}

/**
 * Официальный API Wildberries: еженедельные отчёты реализации из раздела «Финансы»
 * (продажи, возвраты, вознаграждение WB, логистика, хранение, штрафы). Токен — категория «Финансы».
 */
export class WbClient {
  constructor(
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly baseUrl = FINANCE_URL,
  ) {}

  /**
   * Одна страница еженедельных отчётов реализации за даты (YYYY-MM-DD). Следующая страница —
   * с rrdId последней строки; пустой ответ — строк больше нет. Частота запросов у WB ограничена.
   */
  async realizationPage(dateFrom: string, dateTo: string, rrdid: bigint = 0n, limit = 100_000): Promise<WbRealizationRow[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/finance/v1/sales-reports/detailed`, {
      method: 'POST',
      headers: { Authorization: this.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dateFrom, dateTo, rrdId: Number(rrdid), limit, period: 'weekly' }),
    });
    if (res.status === 204) return [];
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const message =
        res.status === 401
          ? 'WB не принял токен: проверьте, что он действует и у него есть категория «Финансы».'
          : res.status === 429
            ? `WB ограничил частоту запросов — повторю через ${res.headers.get('x-ratelimit-retry') ?? 'несколько'} с.`
            : `WB ответил ${res.status}: ${text.slice(0, 200)}`;
      throw new WbApiError(res.status, message, res.status === 429 ? Number(res.headers.get('x-ratelimit-retry') ?? 60) || 60 : null);
    }
    const data = await res.json().catch(() => null);
    return Array.isArray(data) ? data.map(mapWbRealizationRow) : [];
  }
}
