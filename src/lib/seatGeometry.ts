import type { CategoryLayout, RowDef } from '../config/seatLayout';
import { parsePoints, zonesOf } from '../config/seatmapHotspots';
import { blockRanges } from './layout';

export type Pt = [number, number];

export interface SeatDot {
  row: string;
  n: number;
  x: number;
  y: number;
  /** ukuran kursi (sisi) di ruang gambar 1920x1080 */
  r: number;
}

export interface RowGuide {
  row: string;
  /** polyline baris per zona, untuk label & sorotan */
  path: Pt[][];
}

export interface CatGeometry {
  seats: SeatDot[];
  rows: RowGuide[];
}

/** Titik tengah area panggung (main + catwalk + island) di ruang seatmap */
export const STAGE_POINT: Pt = [880, 470];

/* ---------------- util geometri ---------------- */

export function polygonArea(pts: Pt[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

export function centroid(pts: Pt[]): Pt {
  const n = pts.length;
  return [pts.reduce((a, p) => a + p[0], 0) / n, pts.reduce((a, p) => a + p[1], 0) / n];
}

export function pointInPolygon([x, y]: Pt, poly: Pt[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Sumbu panjang poligon (PCA), selalu mengarah ke kanan */
export function principalAxis(pts: Pt[]): Pt {
  const [cx, cy] = centroid(pts);
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of pts) {
    const dx = x - cx;
    const dy = y - cy;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const v: Pt = [Math.cos(theta), Math.sin(theta)];
  return v[0] < 0 ? [-v[0], -v[1]] : v;
}

/** Bagi `total` menjadi bagian bulat proporsional `weights` (largest remainder) */
export function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map((_, i) => (i === 0 ? total : 0));
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let rest = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; rest > 0; k++, rest--) out[order[k % order.length][1]]++;
  return out;
}

/* ---------------- "muka depan" zona ---------------- */

/**
 * Rantai tepi zona yang menghadap panggung: sisi-sisi berurutan yang
 * normal-luarnya mengarah ke panggung, dipilih rangkaian terpanjang.
 * Baris kursi dibuat sejajar rantai ini, seperti tribun sungguhan.
 */
function frontChain(poly: Pt[], stage: Pt): Pt[] {
  const n = poly.length;
  const facing: boolean[] = [];
  const lens: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) || 1;
    lens.push(L);
    let nx = dy / L;
    let ny = -dx / L;
    const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    // pastikan normal mengarah ke LUAR poligon
    if (pointInPolygon([mid[0] + nx * 2, mid[1] + ny * 2], poly)) {
      nx = -nx;
      ny = -ny;
    }
    facing.push(nx * (stage[0] - mid[0]) + ny * (stage[1] - mid[1]) > 0);
  }

  const fallback = (): Pt[] => {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < n; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % n];
      const d = Math.hypot((a[0] + b[0]) / 2 - stage[0], (a[1] + b[1]) / 2 - stage[1]);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return [poly[best], poly[(best + 1) % n]];
  };

  if (!facing.some(Boolean)) return fallback();

  // run melingkar terpanjang (bobot = panjang sisi)
  const start = facing.findIndex((f, i) => !f && facing[(i + 1) % n]);
  if (start < 0) return fallback(); // semua sisi menghadap panggung (poligon kecil)
  let bestRun: number[] = [];
  let bestLen = 0;
  let run: number[] = [];
  let runLen = 0;
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n;
    if (facing[i]) {
      run.push(i);
      runLen += lens[i];
    } else {
      if (runLen > bestLen) {
        bestLen = runLen;
        bestRun = run;
      }
      run = [];
      runLen = 0;
    }
  }
  if (runLen > bestLen) bestRun = run;
  if (!bestRun.length) return fallback();
  const chain: Pt[] = [poly[bestRun[0]]];
  for (const i of bestRun) chain.push(poly[(i + 1) % n]);
  return chain;
}

/** Titik terdekat pada polyline: jarak & posisi (panjang lintasan) */
function projectOnChain(p: Pt, chain: Pt[]): { d: number; s: number } {
  let bestD = Infinity;
  let bestS = 0;
  let acc = 0;
  for (let i = 0; i + 1 < chain.length; i++) {
    const [ax, ay] = chain[i];
    const [bx, by] = chain[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const L2 = dx * dx + dy * dy;
    const L = Math.sqrt(L2);
    let t = L2 ? ((p[0] - ax) * dx + (p[1] - ay) * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(p[0] - ax - t * dx, p[1] - ay - t * dy);
    if (d < bestD) {
      bestD = d;
      bestS = acc + t * L;
    }
    acc += L;
  }
  return { d: bestD, s: bestS };
}

/* ---------------- sampling zona ---------------- */

interface Sample {
  x: number;
  y: number;
  /** jarak dari muka depan zona */
  d: number;
  /**
   * kedalaman relatif 0..1 terhadap kedalaman zona DI POSISI ITU.
   * Dengan ini tiap baris membentang penuh dari ujung ke ujung, tidak
   * mengerut di bagian zona yang dangkal.
   */
  f: number;
  /** posisi sepanjang muka depan */
  s: number;
}

interface Zone {
  poly: Pt[];
  area: number;
  samples: Sample[];
  dMax: number;
  step: number;
  /** true kalau rantai muka depan berjalan dari kanan ke kiri */
  reversed: boolean;
}

function prepareZone(poly: Pt[], stage: Pt, step: number): Zone {
  const chain = frontChain(poly, stage);
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const samples: Sample[] = [];
  for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) {
    for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) {
      if (!pointInPolygon([x, y], poly)) continue;
      const { d, s } = projectOnChain([x, y], chain);
      samples.push({ x, y, d, s, f: 0 });
    }
  }
  // kedalaman maksimum per potongan sepanjang muka depan (dihaluskan)
  const bin = step * 3;
  const maxBy = new Map<number, number>();
  for (const v of samples) {
    const k = Math.floor(v.s / bin);
    maxBy.set(k, Math.max(maxBy.get(k) ?? 0, v.d));
  }
  const localMax = (k: number) => {
    let m = 0;
    for (let j = k - 2; j <= k + 2; j++) m = Math.max(m, maxBy.get(j) ?? 0);
    return Math.max(m, 1e-6);
  };
  for (const v of samples) v.f = Math.min(1, v.d / localMax(Math.floor(v.s / bin)));
  return {
    poly,
    area: polygonArea(poly),
    samples,
    dMax: Math.max(1e-6, ...samples.map((v) => v.d)),
    step,
    reversed: chain[0][0] > chain[chain.length - 1][0],
  };
}

/**
 * Garis tengah satu pita baris: titik pita dikelompokkan per posisi
 * sepanjang muka depan, dirata-rata, lalu diurut. Hasilnya polyline
 * yang mengikuti lengkungan zona.
 */
function bandLine(z: Zone, lo: number, hi: number): Pt[] {
  const inBand = z.samples.filter((v) => v.f >= lo && v.f < hi);
  if (!inBand.length) return [];
  const bin = z.step * 2;
  const bins = new Map<number, { x: number; y: number; s: number; n: number }>();
  for (const p of inBand) {
    const k = Math.floor(p.s / bin);
    const b = bins.get(k) ?? { x: 0, y: 0, s: 0, n: 0 };
    b.x += p.x;
    b.y += p.y;
    b.s += p.s;
    b.n++;
    bins.set(k, b);
  }
  const pts = [...bins.values()]
    .map((b) => ({ x: b.x / b.n, y: b.y / b.n, s: b.s / b.n }))
    .sort((a, b) => a.s - b.s)
    .map((b): Pt => [b.x, b.y]);
  return z.reversed ? pts.reverse() : pts;
}

function polylineLength(line: Pt[]): number {
  let L = 0;
  for (let i = 0; i + 1 < line.length; i++) L += Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]);
  return L;
}

/** Sebar `count` titik merata sepanjang polyline */
function resampleAlong(line: Pt[], count: number): Pt[] {
  if (count <= 0 || !line.length) return [];
  if (line.length === 1) return Array.from({ length: count }, (): Pt => [line[0][0], line[0][1]]);
  const segLen: number[] = [];
  for (let i = 0; i + 1 < line.length; i++) {
    segLen.push(Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]));
  }
  const total = segLen.reduce((a, b) => a + b, 0);
  const spacing = total / count;
  const out: Pt[] = [];
  let seg = 0;
  let acc = 0;
  for (let k = 0; k < count; k++) {
    const target = spacing * (k + 0.5);
    while (seg < segLen.length - 1 && acc + segLen[seg] < target) {
      acc += segLen[seg];
      seg++;
    }
    const t = segLen[seg] ? Math.min(1, (target - acc) / segLen[seg]) : 0;
    out.push([
      line[seg][0] + (line[seg + 1][0] - line[seg][0]) * t,
      line[seg][1] + (line[seg + 1][1] - line[seg][1]) * t,
    ]);
  }
  return out;
}

/** Tarik titik yang keluar poligon ke sampel terdekat di dalam zona */
function snapInside(p: Pt, z: Zone): Pt {
  if (pointInPolygon(p, z.poly)) return p;
  let best: Pt = p;
  let bd = Infinity;
  for (const g of z.samples) {
    const d = (g.x - p[0]) ** 2 + (g.y - p[1]) ** 2;
    if (d < bd) {
      bd = d;
      best = [g.x, g.y];
    }
  }
  return best;
}

/* ---------------- penempatan kursi ---------------- */

/**
 * Posisi tiap kursi satu kategori, DI DALAM poligon zona aslinya di
 * seatmap (ruang 1920x1080), supaya user bisa membayangkan letaknya.
 *
 * - Baris A menempel sisi zona yang menghadap panggung; baris berikutnya
 *   sejajar di belakangnya, jadi deretan kursi ikut lengkungan tribun.
 * - Kursi tiap baris dibagi ke zona CAT itu proporsional dengan panjang
 *   baris di tiap zona, lalu disebar merata.
 * - Nomor kursi mengikuti `row.blocks` & arah penomoran di seatLayout.
 */
export function buildCategoryGeometry(layout: CategoryLayout, stage: Pt = STAGE_POINT): CatGeometry {
  const polys = zonesOf(layout.category).map((z) => parsePoints(z.points) as Pt[]);
  if (!polys.length) return { seats: [], rows: [] };

  const totalArea = polys.reduce((a, p) => a + polygonArea(p), 0);
  const step = Math.max(1.6, Math.min(6, Math.sqrt(totalArea / Math.max(1, layout.capacity)) / 3));

  // zona urut kiri → kanan supaya nomor kursi menyambung antar-zona
  const zones = polys
    .map((p) => prepareZone(p, stage, step))
    .sort((a, b) => centroid(a.poly)[0] - centroid(b.poly)[0]);
  const nRows = layout.rows.length;

  // pass 1: garis tiap baris per zona, lalu bagi kursi sesuai panjangnya
  const lines = layout.rows.map((_, ri) =>
    zones.map((z) => {
      const lo = ri / nRows;
      const hi = (ri + 1) / nRows + (ri === nRows - 1 ? 1e-6 : 0);
      return bandLine(z, lo, hi);
    }),
  );
  const counts = layout.rows.map((row, ri) =>
    apportion(
      row.blocks.reduce((a, b) => a + b, 0),
      lines[ri].map((line) => (line.length ? Math.max(polylineLength(line), 1) : 0)),
    ),
  );

  // ukuran kursi seragam per zona (dari jarak antar-kursi & antar-baris)
  const sizes = zones.map((z, zi) => {
    let minSpacing = Infinity;
    layout.rows.forEach((_, ri) => {
      const c = counts[ri][zi];
      if (c > 1) minSpacing = Math.min(minSpacing, polylineLength(lines[ri][zi]) / c);
    });
    if (!Number.isFinite(minSpacing)) minSpacing = z.dMax / nRows;
    // ukuran kursi dari jarak terdekat antar-kursi & antar-baris (dengan celah)
    return Math.max(1.2, Math.min(minSpacing * 0.68, (z.dMax / nRows) * 0.62, 10));
  });

  // pass 2: tempatkan kursi
  const seats: SeatDot[] = [];
  const zoneOf = new Map<SeatDot, Pt[]>();
  const rows: RowGuide[] = [];
  layout.rows.forEach((row: RowDef, ri) => {
    const ranges = blockRanges(row, layout.numbering);
    const order: number[] = [];
    ranges.forEach(({ start, end }) => {
      const seq = Array.from({ length: end - start + 1 }, (_, k) => start + k);
      order.push(...(layout.numbering === 'rtl' ? seq.reverse() : seq));
    });

    let cursor = 0;
    const path: Pt[][] = [];
    zones.forEach((z, zi) => {
      const pts = resampleAlong(lines[ri][zi], counts[ri][zi]).map((p) => snapInside(p, z));
      for (const [x, y] of pts) {
        const n = order[cursor++];
        if (n === undefined) break;
        const seat: SeatDot = { row: row.label, n, x, y, r: sizes[zi] };
        seats.push(seat);
        zoneOf.set(seat, z.poly);
      }
      if (pts.length) path.push(pts);
    });
    rows.push({ row: row.label, path });
  });

  separate(seats, zoneOf);
  // garis panduan baris mengikuti posisi kursi setelah dipisahkan
  for (const rg of rows) {
    const byRow = seats.filter((x) => x.row === rg.row);
    let i = 0;
    rg.path = rg.path.map((line) => line.map(() => {
      const st = byRow[i++];
      return st ? ([st.x, st.y] as Pt) : line[0];
    }));
  }
  return { seats, rows };
}

/**
 * Pastikan kursi tidak saling tumpuk.
 * 1) Kursi yang terlalu dekat didorong saling menjauh (beberapa iterasi),
 *    tapi gerakan yang membuat kursi keluar zona dibatalkan.
 * 2) Sisa kepadatan: ukuran kursi dikecilkan ke ≤ 90% jarak tetangga
 *    terdekat, jadi tidak ada lagi kotak yang menimpa kotak lain.
 * Pakai grid bucket supaya tetap O(n).
 */
function separate(seats: SeatDot[], zoneOf: Map<SeatDot, Pt[]>) {
  if (seats.length < 2) return;
  const cellOf = () => Math.max(3, ...seats.map((s) => s.r)) * 1.5;
  const neighbors = (cell: number) => {
    const grid = new Map<string, SeatDot[]>();
    for (const s of seats) {
      const k = `${Math.floor(s.x / cell)}|${Math.floor(s.y / cell)}`;
      (grid.get(k) ?? grid.set(k, []).get(k)!).push(s);
    }
    return (s: SeatDot) => {
      const cx = Math.floor(s.x / cell);
      const cy = Math.floor(s.y / cell);
      const out: SeatDot[] = [];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) out.push(...(grid.get(`${cx + dx}|${cy + dy}`) ?? []));
      return out;
    };
  };

  for (let iter = 0; iter < 12; iter++) {
    const near = neighbors(cellOf());
    let moved = 0;
    for (const s of seats) {
      for (const o of near(s)) {
        if (o === s) continue;
        const want = (s.r + o.r) / 2;
        let dx = s.x - o.x;
        let dy = s.y - o.y;
        let d = Math.hypot(dx, dy);
        if (d >= want) continue;
        if (d < 1e-6) {
          // posisi identik: pisahkan ke arah acak tapi deterministik
          const a = ((s.n * 131 + s.row.charCodeAt(0) * 17) % 360) * (Math.PI / 180);
          dx = Math.cos(a);
          dy = Math.sin(a);
          d = 1;
        }
        const push = ((want - Math.hypot(s.x - o.x, s.y - o.y)) / 2) * 0.6;
        const poly = zoneOf.get(s);
        // dekat tepi zona, dorongan penuh bisa keluar poligon: coba yang lebih kecil
        for (const f of [1, 0.5, 0.25, 0.1]) {
          const nx: Pt = [s.x + (dx / d) * push * f, s.y + (dy / d) * push * f];
          if (poly && !pointInPolygon(nx, poly)) continue;
          s.x = nx[0];
          s.y = nx[1];
          moved++;
          break;
        }
      }
    }
    if (!moved) break;
  }

  // sisa tumpukan: kecilkan kursi
  const near = neighbors(cellOf());
  for (const s of seats) {
    let nn = Infinity;
    for (const o of near(s)) if (o !== s) nn = Math.min(nn, Math.hypot(o.x - s.x, o.y - s.y));
    if (Number.isFinite(nn)) s.r = Math.max(0.6, Math.min(s.r, nn * 0.9));
  }
  // kursi di sebelah kursi kecil juga harus muat: ulangi sekali dengan r tetangga
  for (const s of seats) {
    for (const o of near(s)) {
      if (o === s) continue;
      const d = Math.hypot(o.x - s.x, o.y - s.y);
      if (d < (s.r + o.r) / 2) s.r = Math.max(0.6, 2 * d - o.r - 1e-6);
    }
  }
}

/** Bounding box sekumpulan kursi, dengan padding */
export function seatsBBox(seats: { x: number; y: number }[], pad = 30) {
  if (!seats.length) return null;
  const xs = seats.map((s) => s.x);
  const ys = seats.map((s) => s.y);
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return { x, y, width: Math.max(...xs) - x + pad, height: Math.max(...ys) - y + pad };
}
