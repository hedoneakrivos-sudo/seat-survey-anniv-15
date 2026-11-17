import { describe, expect, it } from 'vitest';
import { planNeighbors } from './neighbors';
import { blockRanges, visualBlocks } from './layout';
import type { CategoryLayout } from '../config/seatLayout';

/**
 * Fixture sendiri (bukan data venue), supaya aturan lorong & arah
 * penomoran tetap teruji walau seatLayout.ts diubah admin.
 */
const LTR: CategoryLayout = {
  category: 9,
  name: 'TEST LTR',
  gates: ['1'],
  numbering: 'ltr',
  blockNames: ['Kiri', 'Tengah', 'Kanan'],
  // Kiri 1-6, Tengah 7-18, Kanan 19-24
  rows: [{ label: 'C', blocks: [6, 12, 6] }],
  capacity: 24,
  verified: false,
};
const RTL: CategoryLayout = {
  ...LTR,
  name: 'TEST RTL',
  numbering: 'rtl',
  // Kanan 1-10, Tengah 11-26, Kiri 27-36
  rows: [{ label: 'A', blocks: [10, 16, 10] }],
  capacity: 36,
};

describe('blockRanges', () => {
  it('ltr mulai dari blok kiri', () => {
    expect(blockRanges(LTR.rows[0], 'ltr')).toEqual([
      { start: 1, end: 6 },
      { start: 7, end: 18 },
      { start: 19, end: 24 },
    ]);
  });
  it('rtl mulai dari blok kanan', () => {
    expect(blockRanges(RTL.rows[0], 'rtl')).toEqual([
      { start: 27, end: 36 },
      { start: 11, end: 26 },
      { start: 1, end: 10 },
    ]);
  });
  it('visualBlocks rtl: angka menurun dari kiri ke kanan', () => {
    const v = visualBlocks(RTL.rows[0], 'rtl');
    expect(v[0][0]).toBe(36);
    expect(v[2][v[2].length - 1]).toBe(1);
  });
});

describe('planNeighbors (ltr)', () => {
  it('di tengah blok: kiri −1, kanan +1', () => {
    const p = planNeighbors(LTR, 'C', 10);
    expect(p.left).toEqual({ kind: 'seat', seatNumber: 9 });
    expect(p.right).toEqual({ kind: 'seat', seatNumber: 11 });
    expect(p.blockName).toBe('Tengah');
  });
  it('ujung kanan blok tengah: lorong, tidak loncat ke 19', () => {
    const p = planNeighbors(LTR, 'C', 18);
    expect(p.left).toEqual({ kind: 'seat', seatNumber: 17 });
    expect(p.right).toEqual({ kind: 'edge', reason: 'aisle' });
  });
  it('ujung kiri blok tengah: lorong, tidak loncat ke 6', () => {
    expect(planNeighbors(LTR, 'C', 7).left).toEqual({ kind: 'edge', reason: 'aisle' });
  });
  it('seat 1 = ujung row', () => {
    expect(planNeighbors(LTR, 'C', 1).left).toEqual({ kind: 'edge', reason: 'row_end' });
  });
  it('seat terakhir = ujung row', () => {
    expect(planNeighbors(LTR, 'C', 24).right).toEqual({ kind: 'edge', reason: 'row_end' });
  });
});

describe('planNeighbors (rtl)', () => {
  it('kiri = +1, kanan = −1', () => {
    const p = planNeighbors(RTL, 'A', 15);
    expect(p.left).toEqual({ kind: 'seat', seatNumber: 16 });
    expect(p.right).toEqual({ kind: 'seat', seatNumber: 14 });
  });
  it('seat 1 di ujung kanan row', () => {
    const p = planNeighbors(RTL, 'A', 1);
    expect(p.right).toEqual({ kind: 'edge', reason: 'row_end' });
    expect(p.left).toEqual({ kind: 'seat', seatNumber: 2 });
  });
  it('seat 10 → kiri-nya lorong ke blok tengah', () => {
    expect(planNeighbors(RTL, 'A', 10).left).toEqual({ kind: 'edge', reason: 'aisle' });
  });
});

describe('planNeighbors (layout tak dikenal)', () => {
  it('row tidak ada di config → tebakan ±1', () => {
    const p = planNeighbors(LTR, 'ZZ', 5);
    expect(p.known).toBe(false);
    expect(p.left).toEqual({ kind: 'unknown', seatNumber: 4 });
    expect(p.right).toEqual({ kind: 'unknown', seatNumber: 6 });
  });
  it('seat melebihi row → tebakan ±1', () => {
    const p = planNeighbors(LTR, 'C', 30);
    expect(p.known).toBe(false);
    expect(p.right).toEqual({ kind: 'unknown', seatNumber: 31 });
  });
  it('seat 1 tanpa config → kiri kosong', () => {
    expect(planNeighbors(undefined, 'A', 1).left).toEqual({ kind: 'unknown', seatNumber: null });
  });
});
