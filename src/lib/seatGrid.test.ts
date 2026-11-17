import { describe, expect, it } from 'vitest';
import { SEAT_LAYOUT } from '../config/seatLayout';
import { buildSeatGrid, pointInPolygon } from './seatGrid';

describe.each(SEAT_LAYOUT.map((l) => [l.name, l] as const))('denah 2D %s', (_, layout) => {
  const g = buildSeatGrid(layout);

  it('jumlah kursi = kuota', () => {
    expect(g.seats.length).toBe(layout.capacity);
  });

  it('setiap kursi unik (row + nomor)', () => {
    expect(new Set(g.seats.map((s) => `${s.row}|${s.n}`)).size).toBe(g.seats.length);
  });

  it('setiap kursi ada di dalam zona CAT-nya di seatplan 2D', () => {
    const outside = g.seats.filter((s) => !g.zones.some((z) => pointInPolygon([s.x, s.y], z)));
    expect(outside.map((s) => `${s.row}${s.n}`)).toEqual([]);
  });

  it('kursi tidak saling tumpuk', () => {
    const bad: string[] = [];
    for (let i = 0; i < g.seats.length; i++)
      for (let j = i + 1; j < g.seats.length; j++) {
        const a = g.seats[i];
        const b = g.seats[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) < (a.size + b.size) / 2 - 1e-6) bad.push(`${a.row}${a.n}~${b.row}${b.n}`);
      }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('sebagian besar kursi berukuran penuh (tidak mengecil karena berdesakan)', () => {
    const small = g.seats.filter((s) => s.size < g.seat * 0.6).length;
    expect(small / g.seats.length).toBeLessThan(0.05);
  });

  it('Row A paling dekat panggung, baris belakang makin jauh', () => {
    const dist = layout.rows.map((r) => {
      const ss = g.seats.filter((s) => s.row === r.label);
      return ss.reduce((a, s) => a + Math.hypot(s.x - g.island[0], s.y - g.island[1]), 0) / ss.length;
    });
    for (let i = 1; i < dist.length; i++) expect(dist[i]).toBeGreaterThan(dist[i - 1]);
  });

  it('satu garis panduan per baris', () => {
    expect(g.rows.map((r) => r.row)).toEqual(layout.rows.map((r) => r.label));
  });
});
