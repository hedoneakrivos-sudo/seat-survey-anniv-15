import type { PublicSeat } from './types';

export type SeatState = 'mine' | 'dup' | 'swap' | 'taken' | 'empty';

/** Kelompokkan entri per nomor seat */
export function groupBySeat(seats: PublicSeat[]): Map<number, PublicSeat[]> {
  const m = new Map<number, PublicSeat[]>();
  for (const s of seats) m.set(s.seat_number, [...(m.get(s.seat_number) ?? []), s]);
  return m;
}

/**
 * Status satu kursi, urutan prioritas:
 * seat user > duplikat (lebih dari 1 entri / ditandai duplikat) > mau tukar > terisi > kosong
 */
export function seatState(list: PublicSeat[] | undefined, isMine: boolean): SeatState {
  if (isMine) return 'mine';
  if (!list || list.length === 0) return 'empty';
  if (list.length > 1 || list.some((s) => s.is_duplicate)) return 'dup';
  if (list.some((s) => s.want_swap)) return 'swap';
  return 'taken';
}

export const SEAT_STATE_LABEL: Record<SeatState, string> = {
  mine: 'seat kamu',
  dup: 'duplikat',
  swap: 'mau tukar',
  taken: 'terisi',
  empty: 'kosong',
};

/** Warna kursi (dipakai bersama mini peta & peta detail) */
export const SEAT_STATE_CLASS: Record<SeatState, string> = {
  mine: 'bg-seat-mine text-white ring-2 ring-blue-300 dark:ring-blue-400',
  dup: 'bg-seat-dup text-white',
  swap: 'bg-seat-swap text-white',
  taken: 'bg-seat-taken text-white',
  empty: 'bg-seat-empty text-slate-700 dark:bg-slate-600 dark:text-slate-100',
};

/** Warna isi kursi untuk SVG (tanpa Tailwind) */
export const SEAT_STATE_FILL: Record<SeatState, string> = {
  mine: '#2563eb',
  dup: '#ef4444',
  swap: '#f97316',
  taken: '#10b981',
  empty: '#cbd5e1',
};
