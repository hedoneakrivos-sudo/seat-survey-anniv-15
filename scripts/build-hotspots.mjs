/**
 * Ubah hasil segmentasi warna (scripts/hotspots-raw.json) jadi
 * src/config/seatmapHotspots.ts.
 *
 * Segmentasi dijalankan di browser terhadap public/assets/seatmap.jpg.
 * Koreksi di bawah ini dicek manual terhadap gambar, karena sisi 3D
 * yang gelap kadang terbaca sebagai warna CAT lain.
 *
 *   node scripts/build-hotspots.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const raw = readFileSync(new URL('./hotspots-raw.json', import.meta.url), 'utf8');
const data = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));

const near = (z, x, y, r = 25) => Math.hypot(z.centroid[0] - x, z.centroid[1] - y) <= r;

/** [aturan, aksi] — aksi: nomor CAT baru, atau null = buang */
const FIXES = [
  // dua potongan merah kecil di samping stage = CAT 1 (terbaca CAT 4)
  [(z) => z.cat === 4 && near(z, 855, 358), 1],
  [(z) => z.cat === 4 && near(z, 990, 464), 1],
  // sisi gelap CAT 4 kiri yang terbaca merah
  [(z) => z.cat === 1 && near(z, 370, 424), null],
  // celah langit di dalam floor / sekitar island stage
  [(z) => z.cat === 6 && z.areaPx < 5000, null],
];

const zones = [];
for (const z of data.zones) {
  const fix = FIXES.find(([test]) => test(z));
  const cat = fix ? fix[1] : z.cat;
  if (cat === null) continue;
  zones.push({ ...z, cat });
}

const byCat = {};
for (const z of zones) (byCat[z.cat] ??= []).push(z);

const fmt = (pts) => pts.map(([x, y]) => `${x},${y}`).join(' ');

let out = `/**
 * ============================================================
 *  HOTSPOT SEATMAP (koordinat di atas seatmap.jpg 1920x1080)
 * ============================================================
 * Dibuat otomatis oleh scripts/build-hotspots.mjs dari segmentasi
 * warna gambar, lalu dikoreksi manual. Koordinat masih PERKIRAAN.
 *
 * Mau merapikan? Buka /?editor=1 (dev saja), gambar ulang poligon,
 * klik "Export JSON", lalu tempel hasilnya ke ZONES di bawah.
 *
 * Format titik: "x,y x,y ..." (sama dengan atribut points di SVG).
 */

export const SEATMAP_SIZE = { width: 1920, height: 1080 } as const;

/**
 * Area peta saja (tanpa logo, teks tanggal, dan panel legenda di kanan).
 * Dipakai sebagai viewBox default.
 */
export const MAP_VIEWBOX = { x: 120, y: 180, width: 1140, height: 720 } as const;

export interface Zone {
  /** id unik, mis. "cat3-a" */
  id: string;
  category: number;
  points: string;
}

export const ZONES: Zone[] = [
`;
for (const cat of Object.keys(byCat).sort()) {
  byCat[cat].forEach((z, i) => {
    out += `  { id: 'cat${cat}-${String.fromCharCode(97 + i)}', category: ${cat}, points: '${fmt(z.points)}' },\n`;
  });
}
out += `];

/** Label panggung (non-klik) */
export const STAGES = [
  { id: 'main', label: 'MAIN STAGE', x: 1058, y: 345, rotate: 35 },
  { id: 'island', label: 'ISLAND STAGE', x: 726, y: 512, rotate: 35 },
] as const;

export function zonesOf(category: number): Zone[] {
  return ZONES.filter((z) => z.category === category);
}

/** Bounding box gabungan semua poligon satu CAT */
export function categoryBBox(category: number): { x: number; y: number; width: number; height: number } | null {
  const pts = zonesOf(category).flatMap((z) => parsePoints(z.points));
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function parsePoints(points: string): [number, number][] {
  return points
    .trim()
    .split(/\\s+/)
    .map((p) => p.split(',').map(Number) as [number, number]);
}

/** Titik tengah (rata-rata vertex) poligon terbesar CAT ini, buat pin/badge */
export function categoryAnchor(category: number): [number, number] | null {
  const zs = zonesOf(category);
  if (!zs.length) return null;
  const area = (pts: [number, number][]) =>
    Math.abs(pts.reduce((s, [x, y], i) => {
      const [nx, ny] = pts[(i + 1) % pts.length];
      return s + x * ny - nx * y;
    }, 0)) / 2;
  const biggest = zs.map((z) => parsePoints(z.points)).sort((a, b) => area(b) - area(a))[0];
  const cx = biggest.reduce((s, p) => s + p[0], 0) / biggest.length;
  const cy = biggest.reduce((s, p) => s + p[1], 0) / biggest.length;
  return [Math.round(cx), Math.round(cy)];
}
`;

writeFileSync(new URL('../src/config/seatmapHotspots.ts', import.meta.url), out);
console.log(
  'zona per CAT:',
  Object.fromEntries(Object.entries(byCat).map(([k, v]) => [k, v.length])),
);
