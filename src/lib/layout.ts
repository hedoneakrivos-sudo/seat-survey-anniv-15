import { SEAT_LAYOUT, type CategoryLayout, type NumberingDirection, type RowDef } from '../config/seatLayout';

export function getCategory(category: number | null | undefined): CategoryLayout | undefined {
  return SEAT_LAYOUT.find((c) => c.category === category);
}

export function getRow(layout: CategoryLayout | undefined, rowLabel: string): RowDef | undefined {
  return layout?.rows.find((r) => r.label === rowLabel);
}

export function seatCount(row: RowDef): number {
  return row.blocks.reduce((a, b) => a + b, 0);
}

/**
 * Rentang nomor seat per blok, diindeks sesuai urutan blok (kiri → kanan).
 * - 'ltr': seat 1 di blok paling kiri.
 * - 'rtl': seat 1 di blok paling kanan, jadi penomoran mulai dari blok terakhir.
 */
export function blockRanges(row: RowDef, dir: NumberingDirection = 'ltr'): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = new Array(row.blocks.length);
  const order = row.blocks.map((_, i) => i);
  if (dir === 'rtl') order.reverse();
  let n = 1;
  for (const i of order) {
    out[i] = { start: n, end: n + row.blocks[i] - 1 };
    n += row.blocks[i];
  }
  return out;
}

/** index blok (kiri → kanan) tempat seat berada, -1 kalau di luar row */
export function blockIndexOf(row: RowDef, seat: number, dir: NumberingDirection = 'ltr'): number {
  return blockRanges(row, dir).findIndex((r) => seat >= r.start && seat <= r.end);
}

/**
 * Urutan visual seat per blok, dari kiri ke kanan (menghadap panggung).
 * Dipakai untuk menggambar peta baris.
 */
export function visualBlocks(row: RowDef, dir: NumberingDirection = 'ltr'): number[][] {
  return blockRanges(row, dir).map(({ start, end }) => {
    const seats = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    return dir === 'rtl' ? seats.reverse() : seats;
  });
}

/** Format "Gate 2/3/4" */
export function formatGateList(gates: string[]): string {
  return 'Gate ' + gates.join('/');
}
