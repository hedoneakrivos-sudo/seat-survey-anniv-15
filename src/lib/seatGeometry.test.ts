import { describe, expect, it } from 'vitest';
import { buildCategoryGeometry, pointInPolygon as inside, principalAxis, type Pt } from './seatGeometry';
import { SEAT_LAYOUT } from '../config/seatLayout';
import { parsePoints, zonesOf } from '../config/seatmapHotspots';

describe('principalAxis', () => {
  it('persegi panjang miring 30°: sumbu mengikuti sisi panjang', () => {
    const a = (30 * Math.PI) / 180;
    const rot = ([x, y]: Pt): Pt => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
    const rect = ([[-50, -10], [50, -10], [50, 10], [-50, 10]] as Pt[]).map(rot);
    const [ux, uy] = principalAxis(rect);
    expect(Math.atan2(uy, ux)).toBeCloseTo(a, 2);
  });
});

describe.each(SEAT_LAYOUT.map((l) => [l.name, l] as const))('%s', (_, layout) => {
  const g = buildCategoryGeometry(layout);
  const polys = zonesOf(layout.category).map((z) => parsePoints(z.points) as Pt[]);

  it('jumlah kursi = kuota', () => {
    expect(g.seats.length).toBe(layout.capacity);
  });

  it('setiap kursi unik (row + nomor)', () => {
    const keys = new Set(g.seats.map((s) => `${s.row}|${s.n}`));
    expect(keys.size).toBe(g.seats.length);
  });

  it('setiap kursi ada di dalam salah satu poligon zona aslinya', () => {
    const outside = g.seats.filter((s) => !polys.some((p) => inside([s.x, s.y], p)));
    expect(outside.map((s) => `${s.row}${s.n}`)).toEqual([]);
  });

  it('kursi tidak saling tumpuk', () => {
    const overlaps: string[] = [];
    for (let i = 0; i < g.seats.length; i++)
      for (let j = i + 1; j < g.seats.length; j++) {
        const a = g.seats[i];
        const b = g.seats[j];
        // kotak berukuran r: tumpuk kalau jarak < rata-rata sisi
        if (Math.hypot(a.x - b.x, a.y - b.y) < (a.r + b.r) / 2 - 1e-6) overlaps.push(`${a.row}${a.n}~${b.row}${b.n}`);
      }
    expect(overlaps.slice(0, 5)).toEqual([]);
  });

  it('satu garis panduan per baris', () => {
    expect(g.rows.map((r) => r.row)).toEqual(layout.rows.map((r) => r.label));
  });
});
