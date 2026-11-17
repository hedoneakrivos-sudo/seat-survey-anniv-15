import { describe, expect, it } from 'vitest';
import { CAT_CONFIG, formatPrices, formatRupiah } from './catConfig';
import { SEAT_LAYOUT } from './seatLayout';
import { countdownLabel, daysUntil } from '../lib/countdown';

/** Rasio kontras WCAG 2.x */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('catConfig', () => {
  it('7 kategori, sinkron dengan seatLayout', () => {
    expect(CAT_CONFIG.map((c) => c.category)).toEqual(SEAT_LAYOUT.map((c) => c.category));
  });

  it.each(CAT_CONFIG.map((c) => [c.name, c] as const))('%s: teks chip lolos WCAG AA (≥ 4.5)', (_, c) => {
    expect(contrast(c.color, c.textColor)).toBeGreaterThanOrEqual(4.5);
  });

  it('format harga sama dengan poster', () => {
    expect(formatRupiah(3_500_000)).toBe('Rp3.500.000');
    expect(formatPrices(CAT_CONFIG[2])).toBe('Rp1.100.000 (Pre-Sale) | Rp1.200.000 (General)');
    expect(formatPrices(CAT_CONFIG[6])).toBe('Rp450.000 (General Only)');
  });
});

describe('countdown (WIB)', () => {
  const tz = 'Asia/Jakarta';
  it('16 Nov 2026 → H-33', () => {
    expect(daysUntil('2026-12-19', new Date('2026-11-16T05:00:00Z'), tz)).toBe(33);
  });
  it('pakai tanggal WIB, bukan UTC: 18 Des 17:30 UTC = 19 Des 00:30 WIB → hari H', () => {
    expect(daysUntil('2026-12-19', new Date('2026-12-18T17:30:00Z'), tz)).toBe(0);
  });
  it('label', () => {
    expect(countdownLabel(33, 'Ayo Senyumlah')).toBe('H-33 menuju Ayo Senyumlah');
    expect(countdownLabel(0, 'Ayo Senyumlah')).toMatch(/^Hari H!/);
    expect(countdownLabel(-1, 'Ayo Senyumlah')).toMatch(/Makasih/);
  });
});
