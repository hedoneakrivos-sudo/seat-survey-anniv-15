import { describe, expect, it } from 'vitest';
import { SEAT_LAYOUT } from '../config/seatLayout';
import { buildSeatGrid, PITCH, SEAT } from './seatGrid';

describe.each(SEAT_LAYOUT.map((l) => [l.name, l] as const))('denah 2D %s', (_, layout) => {
  const g = buildSeatGrid(layout);

  it('jumlah kursi = kuota', () => {
    expect(g.seats.length).toBe(layout.capacity);
  });

  it('setiap kursi unik (row + nomor)', () => {
    expect(new Set(g.seats.map((s) => `${s.row}|${s.n}`)).size).toBe(g.seats.length);
  });

  it('kursi tidak saling tumpuk', () => {
    const bad: string[] = [];
    for (let i = 0; i < g.seats.length; i++)
      for (let j = i + 1; j < g.seats.length; j++) {
        const a = g.seats[i];
        const b = g.seats[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) < SEAT - 1e-6) bad.push(`${a.row}${a.n}~${b.row}${b.n}`);
      }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('Row A paling dekat panggung, baris belakang makin jauh', () => {
    const stageY = g.stage.kind === 'bar' ? g.stage.y : g.stage.label[1];
    const dist = layout.rows.map((r) => {
      const ss = g.seats.filter((s) => s.row === r.label);
      return ss.reduce((a, s) => a + Math.hypot(s.x, s.y - (g.stage.kind === 'bar' ? stageY : 0)), 0) / ss.length;
    });
    for (let i = 1; i < dist.length; i++) expect(dist[i]).toBeGreaterThan(dist[i - 1]);
  });

  it('nomor kursi naik dari kiri ke kanan dalam satu blok (ltr)', () => {
    if (layout.numbering !== 'ltr') return;
    for (const r of layout.rows) {
      const ss = g.seats.filter((s) => s.row === r.label);
      for (let b = 0; b < r.blocks.length; b++) {
        const blk = ss.filter((s) => s.block === b).sort((x, y) => x.n - y.n);
        for (let k = 1; k < blk.length; k++) expect(blk[k].x).toBeGreaterThan(blk[k - 1].x - PITCH * 0.05);
      }
    }
  });

  it('semua kursi ada di dalam bbox tampilan', () => {
    const { x, y, width, height } = g.bbox;
    expect(g.seats.every((s) => s.x > x && s.x < x + width && s.y > y && s.y < y + height)).toBe(true);
  });
});
