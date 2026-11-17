import type { CategoryLayout } from '../config/seatLayout';
import { blockIndexOf, blockRanges, getRow } from './layout';

/**
 * Hasil penentuan tetangga di satu sisi.
 * - seat:   nomor seat tetangga (cari di DB)
 * - edge:   seat ini ujung blok (ada lorong / dinding), tidak ada tetangga
 * - unknown: layout row tidak dikenal, jadi pakai tebakan ±1 apa adanya
 */
export type NeighborSlot =
  | { kind: 'seat'; seatNumber: number }
  | { kind: 'edge'; reason: 'aisle' | 'row_end' }
  | { kind: 'unknown'; seatNumber: number | null };

export interface NeighborPlan {
  left: NeighborSlot;
  right: NeighborSlot;
  /** apakah layout row ini dikenal di config */
  known: boolean;
  blockName?: string;
}

/**
 * "Kiri" / "kanan" di sini dilihat dari kursi, menghadap panggung.
 * - Penomoran 'ltr': kiri = seat − 1, kanan = seat + 1.
 * - Penomoran 'rtl': kebalikannya.
 *
 * Tetangga tidak pernah melompati lorong: kalau seat di ujung blok,
 * sisi itu jadi `edge`.
 */
export function planNeighbors(
  layout: CategoryLayout | undefined,
  rowLabel: string,
  seatNumber: number,
): NeighborPlan {
  const row = getRow(layout, rowLabel);
  const dir = layout?.numbering ?? 'ltr';
  const leftDelta = dir === 'ltr' ? -1 : 1;

  if (!layout || !row) {
    return {
      known: false,
      left: { kind: 'unknown', seatNumber: seatNumber + leftDelta >= 1 ? seatNumber + leftDelta : null },
      right: { kind: 'unknown', seatNumber: seatNumber - leftDelta >= 1 ? seatNumber - leftDelta : null },
    };
  }

  const bi = blockIndexOf(row, seatNumber, dir);
  if (bi < 0) {
    // seat di luar jangkauan config (data dummy): tetap coba ±1 tanpa aturan blok
    return {
      known: false,
      left: { kind: 'unknown', seatNumber: seatNumber + leftDelta >= 1 ? seatNumber + leftDelta : null },
      right: { kind: 'unknown', seatNumber: seatNumber - leftDelta >= 1 ? seatNumber - leftDelta : null },
    };
  }

  const range = blockRanges(row, dir)[bi];
  const lastBlock = row.blocks.length - 1;

  const side = (delta: number, isLeftSide: boolean): NeighborSlot => {
    const n = seatNumber + delta;
    if (n >= range.start && n <= range.end) return { kind: 'seat', seatNumber: n };
    // keluar dari blok: lorong kalau masih ada blok di sisi itu, selain itu ujung row
    const outermost = isLeftSide ? bi === 0 : bi === lastBlock;
    return { kind: 'edge', reason: outermost ? 'row_end' : 'aisle' };
  };

  return {
    known: true,
    blockName: layout.blockNames[bi],
    left: side(leftDelta, true),
    right: side(-leftDelta, false),
  };
}

/** Nomor seat yang perlu diambil dari DB untuk rencana ini */
export function neighborSeatNumbers(plan: NeighborPlan): number[] {
  return [plan.left, plan.right]
    .map((s) => (s.kind === 'edge' ? null : s.seatNumber))
    .filter((n): n is number => n !== null);
}
