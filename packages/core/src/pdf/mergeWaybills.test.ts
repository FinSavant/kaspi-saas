import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { mergeWaybills } from './mergeWaybills';

const A6: [number, number] = [297.64, 419.53];

async function makeLabels(count: number): Promise<Uint8Array[]> {
  const labels: Uint8Array[] = [];
  for (let i = 0; i < count; i++) {
    const doc = await PDFDocument.create();
    doc.addPage(A6).drawText(`Order ${i + 1}`, { x: 20, y: 380 });
    labels.push(await doc.save());
  }
  return labels;
}

async function pageSizes(pdf: Uint8Array) {
  const doc = await PDFDocument.load(pdf);
  return doc.getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())]);
}

describe('mergeWaybills', () => {
  it('keeps one label per page for thermal printers', async () => {
    const result = await mergeWaybills(await makeLabels(3), 'thermal');
    expect(result.mergedCount).toBe(3);
    expect(await pageSizes(result.pdf)).toEqual([[298, 420], [298, 420], [298, 420]]);
  });

  it('puts four labels on each portrait A4 page', async () => {
    const result = await mergeWaybills(await makeLabels(5), 'a4x4');
    expect(await pageSizes(result.pdf)).toEqual([[595, 842], [595, 842]]);
  });

  it('puts eight labels on each landscape A4 page', async () => {
    const result = await mergeWaybills(await makeLabels(9), 'a4x8');
    expect(await pageSizes(result.pdf)).toEqual([[842, 595], [842, 595]]);
  });

  it('fills exactly one page with eight labels', async () => {
    const result = await mergeWaybills(await makeLabels(8), 'a4x8');
    expect(await pageSizes(result.pdf)).toHaveLength(1);
  });

  it('skips unreadable files and reports their indexes', async () => {
    const labels = await makeLabels(2);
    const result = await mergeWaybills([labels[0]!, new TextEncoder().encode('not a pdf'), labels[1]!], 'a4x4');
    expect(result.mergedCount).toBe(2);
    expect(result.failedIndexes).toEqual([1]);
    expect(await pageSizes(result.pdf)).toHaveLength(1);
  });

  it('reports nothing merged for no input', async () => {
    const result = await mergeWaybills([], 'a4x4');
    expect(result.mergedCount).toBe(0);
    expect(result.failedIndexes).toEqual([]);
  });
});
