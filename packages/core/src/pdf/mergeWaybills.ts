import { PDFDocument, type PDFEmbeddedPage } from 'pdf-lib';

export type WaybillLayout = 'thermal' | 'a4x4' | 'a4x8';

export interface MergeResult {
  pdf: Uint8Array;
  /** Сколько входных накладных попало в итоговый файл. */
  mergedCount: number;
  /** Индексы входных файлов, которые не удалось прочитать как PDF. */
  failedIndexes: number[];
}

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

const GRIDS: Record<Exclude<WaybillLayout, 'thermal'>, { pageSize: [number, number]; cols: number; rows: number }> = {
  // 2×2 на портретном A4: ячейка равна A6
  a4x4: { pageSize: [A4_WIDTH, A4_HEIGHT], cols: 2, rows: 2 },
  // 4×2 на альбомном A4: ячейка равна A7
  a4x8: { pageSize: [A4_HEIGHT, A4_WIDTH], cols: 4, rows: 2 },
};

const CELL_PADDING = 6;

/**
 * Склеивает накладные в один PDF. `thermal` — по одной накладной на страницу
 * в исходном размере, `a4x4` и `a4x8` — сеткой на листах A4.
 */
export async function mergeWaybills(waybills: Uint8Array[], layout: WaybillLayout): Promise<MergeResult> {
  const out = await PDFDocument.create();
  const failedIndexes: number[] = [];
  const sources: PDFDocument[] = [];

  for (const [index, bytes] of waybills.entries()) {
    try {
      sources.push(await PDFDocument.load(bytes));
    } catch {
      failedIndexes.push(index);
    }
  }

  if (layout === 'thermal') {
    for (const source of sources) {
      const pages = await out.copyPages(source, source.getPageIndices());
      for (const page of pages) out.addPage(page);
    }
  } else {
    const embedded: PDFEmbeddedPage[] = [];
    for (const source of sources) {
      embedded.push(...(await out.embedPages(source.getPages())));
    }
    drawGrid(out, embedded, GRIDS[layout]);
  }

  return { pdf: await out.save(), mergedCount: sources.length, failedIndexes };
}

/** Склеивает готовые PDF подряд, страница за страницей (склейки нескольких магазинов в один файл). */
export async function concatPdfs(files: Uint8Array[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const bytes of files) {
    const source = await PDFDocument.load(bytes);
    for (const page of await out.copyPages(source, source.getPageIndices())) out.addPage(page);
  }
  return out.save();
}

function drawGrid(
  out: PDFDocument,
  labels: PDFEmbeddedPage[],
  grid: { pageSize: [number, number]; cols: number; rows: number },
): void {
  const [pageWidth, pageHeight] = grid.pageSize;
  const cellWidth = pageWidth / grid.cols;
  const cellHeight = pageHeight / grid.rows;
  const perPage = grid.cols * grid.rows;

  for (const [index, label] of labels.entries()) {
    const slot = index % perPage;
    const page = slot === 0 ? out.addPage(grid.pageSize) : out.getPage(out.getPageCount() - 1);

    const col = slot % grid.cols;
    const row = Math.floor(slot / grid.cols);
    const scale = Math.min(
      (cellWidth - CELL_PADDING * 2) / label.width,
      (cellHeight - CELL_PADDING * 2) / label.height,
    );
    const width = label.width * scale;
    const height = label.height * scale;

    // Начало координат PDF — левый нижний угол, а заполняем сверху вниз
    page.drawPage(label, {
      x: col * cellWidth + (cellWidth - width) / 2,
      y: pageHeight - (row + 1) * cellHeight + (cellHeight - height) / 2,
      width,
      height,
    });
  }
}
