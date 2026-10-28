import { strFromU8, unzipSync } from 'fflate';

/** Строка детализации отчёта о реализации WB из файла (zip или xlsx из кабинета). */
export interface WbFileRow {
  /** Номер строки в отчёте (колонка «№»). */
  rowNo: number;
  nmId: string | null;
  saName: string | null;
  brand: string | null;
  subject: string | null;
  title: string | null;
  docType: string | null;
  operName: string | null;
  quantity: number;
  retailAmount: number;
  forPay: number;
  delivery: number;
  storage: number;
  penalty: number;
  acceptance: number;
  deduction: number;
  additionalPayment: number;
  warehouse: string | null;
  saleMethod: string | null;
  saleDate: Date | null;
}

export interface WbParsedReport {
  /** Номер отчёта из имени файла («…№869909789_…»); null — не нашёлся. */
  reportId: string | null;
  fileName: string;
  rows: WbFileRow[];
}

export class WbReportFormatError extends Error {}

/** Колонки файла WB → поля строки. Названия — как в выгрузке кабинета. */
const COLUMNS = {
  rowNo: '№',
  subject: 'Предмет',
  nmId: 'Код номенклатуры',
  brand: 'Бренд',
  saName: 'Артикул поставщика',
  title: 'Название',
  docType: 'Тип документа',
  operName: 'Обоснование для оплаты',
  saleDate: 'Дата продажи',
  quantity: 'Кол-во',
  retailAmount: 'Вайлдберриз реализовал Товар (Пр)',
  forPay: 'К перечислению Продавцу за реализованный Товар',
  delivery: 'Услуги по доставке товара покупателю',
  rebill: 'Возмещение издержек по перевозке/по складским операциям с товаром',
  storage: 'Хранение',
  penalty: 'Общая сумма штрафов',
  acceptance: 'Услуга по обработке Товара',
  deduction: 'Удержания',
  additionalPayment: 'Корректировка Вознаграждения Вайлдберриз (ВВ)',
  warehouse: 'Склад',
  saleMethod: 'Способы продажи и тип товара',
} as const;
const REQUIRED = ['nmId', 'docType', 'operName', 'retailAmount', 'forPay'] as const;

const decode = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');

const colIndex = (ref: string) => [...ref].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** Первый лист xlsx как таблица строк (без библиотек: xlsx — это zip с XML). */
export function readXlsxRows(xlsx: Uint8Array): string[][] {
  const files = unzipSync(xlsx);
  const shared = files['xl/sharedStrings.xml']
    ? [...strFromU8(files['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
        decode([...m[1]!.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
      )
    : [];
  const sheetName = Object.keys(files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort()[0];
  if (!sheetName) throw new WbReportFormatError('В файле Excel нет листа с данными.');
  const sheet = strFromU8(files[sheetName]!);

  const rows: string[][] = [];
  for (const row of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const c of row[1]!.matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[2] ?? '';
      const body = c[3] ?? '';
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = '';
      if (/t="s"/.test(attrs) && v !== undefined) value = shared[Number(v)] ?? '';
      else if (/t="inlineStr"/.test(attrs)) value = decode([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''));
      else if (v !== undefined) value = decode(v);
      cells[colIndex(c[1]!)] = value;
    }
    rows.push(Array.from(cells, (x) => x ?? ''));
  }
  return rows;
}

const num = (s: string | undefined) => {
  const n = Number(String(s ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const text = (s: string | undefined) => (s && s.trim() !== '' && s.trim() !== '0' ? s.trim() : null);
/** Дата строкой «2026-10-06» или числом Excel (дни с 1899-12-30). */
function date(s: string | undefined): Date | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(`${s.slice(0, 10)}T12:00:00+03:00`);
  const serial = Number(s);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
  return null;
}

/** Строки одного xlsx: заголовки ищутся по названию, порядок колонок не важен. */
export function parseWbReportSheet(rows: string[][]): WbFileRow[] {
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const at = Object.fromEntries(
    Object.entries(COLUMNS).map(([key, name]) => [key, header.indexOf(name.toLowerCase())]),
  ) as Record<keyof typeof COLUMNS, number>;
  const missing = REQUIRED.filter((k) => at[k] < 0);
  if (missing.length) {
    throw new WbReportFormatError(
      `Это не детализация отчёта о реализации WB: нет колонок ${missing.map((k) => `«${COLUMNS[k]}»`).join(', ')}.`,
    );
  }
  const get = (r: string[], key: keyof typeof COLUMNS) => (at[key] >= 0 ? r[at[key]] : undefined);

  return rows
    .slice(1)
    .filter((r) => r.some((c) => c !== ''))
    .map((r, i) => ({
      rowNo: Math.trunc(num(get(r, 'rowNo'))) || i + 1,
      nmId: text(get(r, 'nmId')),
      saName: text(get(r, 'saName')),
      brand: text(get(r, 'brand')),
      subject: text(get(r, 'subject')),
      title: text(get(r, 'title')),
      docType: text(get(r, 'docType')),
      operName: text(get(r, 'operName')),
      quantity: Math.trunc(num(get(r, 'quantity'))),
      retailAmount: num(get(r, 'retailAmount')),
      forPay: num(get(r, 'forPay')),
      // Логистика и возмещение издержек по перевозке — обе удерживаются с продавца
      delivery: num(get(r, 'delivery')) + num(get(r, 'rebill')),
      storage: num(get(r, 'storage')),
      penalty: num(get(r, 'penalty')),
      acceptance: num(get(r, 'acceptance')),
      deduction: num(get(r, 'deduction')),
      additionalPayment: num(get(r, 'additionalPayment')),
      warehouse: text(get(r, 'warehouse')),
      saleMethod: text(get(r, 'saleMethod')),
      saleDate: date(get(r, 'saleDate')),
    }));
}

const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b;
const reportIdOf = (name: string) => name.match(/№\s*(\d{5,})/)?.[1] ?? name.match(/(\d{8,})/)?.[1] ?? null;

/**
 * Файл из кабинета WB: zip с одним или несколькими xlsx (каждый — свой отчёт) или сам xlsx.
 * xlsx тоже zip, поэтому отличаем по содержимому: в xlsx есть xl/workbook.xml.
 */
export function parseWbReportFile(bytes: Uint8Array, fileName: string): WbParsedReport[] {
  if (!isZip(bytes)) throw new WbReportFormatError('Нужен zip или Excel (.xlsx) из кабинета WB.');
  const files = unzipSync(bytes);
  if (files['xl/workbook.xml']) return [{ reportId: reportIdOf(fileName), fileName, rows: parseWbReportSheet(readXlsxRows(bytes)) }];

  const reports = Object.entries(files)
    .filter(([name]) => /\.xlsx$/i.test(name))
    .map(([name, data]) => {
      const inner = name.split('/').pop()!;
      return { reportId: reportIdOf(inner) ?? reportIdOf(fileName), fileName: inner, rows: parseWbReportSheet(readXlsxRows(data)) };
    });
  if (reports.length === 0) throw new WbReportFormatError('В архиве нет файла Excel с отчётом.');
  return reports;
}
