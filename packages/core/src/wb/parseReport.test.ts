import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parseWbReportFile, WbReportFormatError } from './parseReport';

/** Минимальный xlsx как у WB: строки внутри ячеек (inlineStr), числа — <v>. */
function xlsx(rows: (string | number)[][]): Uint8Array {
  const col = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)));
  const cells = (r: (string | number)[], y: number) =>
    r
      .map((v, x) =>
        typeof v === 'number'
          ? `<c r="${col(x)}${y}"><v>${v}</v></c>`
          : `<c r="${col(x)}${y}" t="inlineStr"><is><t>${v.replace(/&/g, '&amp;')}</t></is></c>`,
      )
      .join('');
  const sheet = `<worksheet><sheetData>${rows.map((r, i) => `<row r="${i + 1}">${cells(r, i + 1)}</row>`).join('')}</sheetData></worksheet>`;
  return zipSync({ 'xl/workbook.xml': strToU8('<workbook/>'), 'xl/worksheets/sheet1.xml': strToU8(sheet) });
}

const HEADER = [
  '№', 'Код номенклатуры', 'Артикул поставщика', 'Название', 'Тип документа', 'Обоснование для оплаты', 'Дата продажи', 'Кол-во',
  'Вайлдберриз реализовал Товар (Пр)', 'К перечислению Продавцу за реализованный Товар', 'Услуги по доставке товара покупателю', 'Склад',
];

describe('parseWbReportFile', () => {
  const file = xlsx([
    HEADER,
    [1, 325325522, 'kor3', 'Мазь & крем', 'Продажа', 'Логистика', '2026-10-06', 0, 0, 0, 186.25, 'Атакент'],
    [2, 325325522, 'kor3', 'Мазь & крем', 'Продажа', 'Продажа', '2026-10-06', 1, 1740.52, 1410.78, 0, 'Атакент'],
  ]);

  it('reads an xlsx by column names and takes the report number from the file name', () => {
    const [report] = parseWbReportFile(file, 'Еженедельный детализированный отчет №869909789_809849 - 1.xlsx');
    expect(report!.reportId).toBe('869909789');
    expect(report!.rows).toHaveLength(2);
    expect(report!.rows[1]).toMatchObject({ rowNo: 2, nmId: '325325522', saName: 'kor3', title: 'Мазь & крем', docType: 'Продажа', quantity: 1, retailAmount: 1740.52, forPay: 1410.78 });
    expect(report!.rows[0]).toMatchObject({ operName: 'Логистика', delivery: 186.25, warehouse: 'Атакент' });
  });

  it('opens a zip from the WB cabinet with the report inside', () => {
    const zip = zipSync({ 'отчет №869909789.xlsx': file });
    const reports = parseWbReportFile(zip, 'Еженедельный детализированный отчет №869909789_809849.zip');
    expect(reports.map((r) => [r.reportId, r.rows.length])).toEqual([['869909789', 2]]);
  });

  it('rejects a file that is not a realization report', () => {
    expect(() => parseWbReportFile(xlsx([['Артикул', 'Цена'], ['a', 1]]), 'prices.xlsx')).toThrow(WbReportFormatError);
  });
});
