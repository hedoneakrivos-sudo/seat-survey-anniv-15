import type { CategoryLayout } from '../config/seatLayout';
import { PLAN_ISLAND, PLAN_SIZE, PLAN_STAGE, parsePlanPoints, planZonesOf } from '../config/seatZones2d';
import { visualBlocks } from './layout';

/**
 * Denah kursi 2D tampak atas untuk satu CAT, mengikuti bentuk zona di
 * seatplan resmi (Seatplan_2D.png → src/config/seatZones2d.ts).
 *
 * - Kursi diletakkan DI DALAM poligon zona CAT itu, jumlahnya persis
 *   sesuai seatLayout (kuota tidak berubah).
 * - Baris = busur konsentris mengelilingi island stage: Row A paling
 *   dekat panggung, baris berikutnya makin jauh.
 * - Tiap baris dipotong oleh tepi zona; potongan-potongan itu menjadi
 *   blok (lorong = celah antar-zona). Kursi baris dibagi ke potongan
 *   sesuai panjangnya, lalu diberi nomor kiri → kanan.
 *
 * Koordinat = ruang PLAN_SIZE (1000 x 692), panggung di kanan.
 */

export type Pt = [number, number];

const SEAT_MAX = 9;

export interface GridSeat {
  row: string;
  n: number;
  x: number;
  y: number;
  /** rotasi kursi (derajat) supaya sisi depan menghadap island */
  angle: number;
  /** indeks zona tempat kursi berada */
  block: number;
  /** sisi kursi; biasanya = grid.seat, lebih kecil kalau berdesakan */
  size: number;
}

export interface GridRow {
  row: string;
  /** titik label di kedua ujung baris */
  left: Pt;
  right: Pt;
  /** garis tengah baris per potongan (buat sorotan) */
  path: Pt[][];
}

export interface SeatGrid {
  seats: GridSeat[];
  rows: GridRow[];
  /** poligon zona CAT ini */
  zones: Pt[][];
  /** siluet panggung */
  stage: Pt[];
  island: Pt;
  /** sisi kursi (seragam per CAT) */
  seat: number;
  bbox: { x: number; y: number; width: number; height: number };
}

/* ---------------- util ---------------- */

export function pointInPolygon([x, y]: Pt, poly: Pt[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function polygonArea(p: Pt[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

/** jarak titik ke tepi poligon terdekat */
function edgeDistance([x, y]: Pt, poly: Pt[]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j];
    const [bx, by] = poly[i];
    const dx = bx - ax;
    const dy = by - ay;
    const L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}

/** bagi `total` bulat proporsional `weights` (largest remainder) */
function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map((_, i) => (i === 0 ? total : 0));
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let rest = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; rest > 0; k++, rest--) out[order[k % order.length][1]]++;
  return out;
}

/* ---------------- koordinat baris per zona ---------------- */

/** sudut "dari kiri": 0 = kiri island, positif = ke bawah layar. Kontinu di sisi kiri. */
const thetaOf = (p: Pt, c: Pt) => Math.atan2(p[1] - c[1], -(p[0] - c[0]));

/** jarak titik ke polyline (rantai tepi) */
function chainDistance([x, y]: Pt, chain: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < chain.length; i++) {
    const [ax, ay] = chain[i];
    const [bx, by] = chain[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}

/**
 * Tepi depan (menghadap island) & tepi belakang zona: rangkaian sisi
 * berurutan terpanjang yang normal-luarnya menghadap / membelakangi island.
 */
function frontBack(poly: Pt[], c: Pt): { front: Pt[]; back: Pt[] } {
  const n = poly.length;
  const facing: number[] = []; // +1 menghadap, -1 membelakangi, 0 samping
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
    if (pointInPolygon([mid[0] + nx * 1.5, mid[1] + ny * 1.5], poly)) {
      nx = -nx;
      ny = -ny;
    }
    const tx = c[0] - mid[0];
    const ty = c[1] - mid[1];
    const cos = (nx * tx + ny * ty) / (Math.hypot(tx, ty) || 1);
    facing.push(cos > 0.25 ? 1 : cos < -0.25 ? -1 : 0);
  }
  const longestRun = (want: number): number[] => {
    const start = facing.findIndex((f) => f !== want);
    if (start < 0) return facing.map((_, i) => i);
    let best: number[] = [];
    let bestLen = 0;
    let run: number[] = [];
    let runLen = 0;
    for (let k = 1; k <= n; k++) {
      const i = (start + k) % n;
      if (facing[i] === want) {
        run.push(i);
        runLen += lens[i];
      } else {
        if (runLen > bestLen) {
          bestLen = runLen;
          best = run;
        }
        run = [];
        runLen = 0;
      }
    }
    if (runLen > bestLen) best = run;
    return best;
  };
  const toChain = (idx: number[]): Pt[] => (idx.length ? [poly[idx[0]], ...idx.map((i) => poly[(i + 1) % n])] : []);
  let front = toChain(longestRun(1));
  let back = toChain(longestRun(-1));
  if (front.length < 2 || back.length < 2) {
    // cadangan: sisi terdekat / terjauh dari island
    const ds = poly.map((_, i) => {
      const a = poly[i];
      const b = poly[(i + 1) % n];
      return Math.hypot((a[0] + b[0]) / 2 - c[0], (a[1] + b[1]) / 2 - c[1]);
    });
    const iMin = ds.indexOf(Math.min(...ds));
    const iMax = ds.indexOf(Math.max(...ds));
    if (front.length < 2) front = [poly[iMin], poly[(iMin + 1) % n]];
    if (back.length < 2) back = [poly[iMax], poly[(iMax + 1) % n]];
  }
  return { front, back };
}

interface Sample {
  p: Pt;
  /** 0 = tepi depan, 1 = tepi belakang */
  f: number;
  th: number;
}

/**
 * Kedalaman radial: jarak masuk & keluar zona sepanjang sinar dari island
 * di sudut th. Lekukan kecil di tepi belakang diabaikan lewat penghalusan
 * (minimum lokal) sehingga baris belakang tidak tersedot ke lekukan.
 */
function radialProfile(poly: Pt[], c: Pt, inset: number) {
  const ths = poly.map((p) => thetaOf(p, c));
  const t0 = Math.min(...ths);
  const t1 = Math.max(...ths);
  let rFar = 0;
  for (const p of poly) rFar = Math.max(rFar, Math.hypot(p[0] - c[0], p[1] - c[1]));
  const n = Math.max(90, Math.ceil(((t1 - t0) * rFar) / 2));
  const at = (th: number, r: number): Pt => [c[0] - r * Math.cos(th), c[1] + r * Math.sin(th)];
  const raw: { rIn: number; rOut: number }[] = [];
  for (let k = 0; k <= n; k++) {
    const th = t0 + ((t1 - t0) * k) / n;
    let rIn = -1;
    let rOut = -1;
    for (let r = 1; r <= rFar + 1; r += 0.75) {
      if (pointInPolygon(at(th, r), poly)) {
        if (rIn < 0) rIn = r;
        rOut = r;
      } else if (rIn >= 0) break;
    }
    raw.push({ rIn, rOut });
  }
  // rOut: ambil maksimum lokal lalu minimum lokal (closing) supaya lekukan
  // sempit di punggung zona tertutup
  const W = Math.max(3, Math.round(n / 40));
  const win = <T,>(i: number, f: (j: number) => T) => {
    const out: T[] = [];
    for (let j = Math.max(0, i - W); j <= Math.min(n, i + W); j++) out.push(f(j));
    return out;
  };
  const valid = (j: number) => raw[j].rIn >= 0;
  const dil = raw.map((_, i) => Math.max(...win(i, (j) => (valid(j) ? raw[j].rOut : -Infinity))));
  const rOut = dil.map((_, i) => Math.min(...win(i, (j) => (valid(j) ? dil[j] : Infinity))));
  return {
    t0,
    t1,
    n,
    get(th: number) {
      const k = Math.max(0, Math.min(n, Math.round(((th - t0) / (t1 - t0 || 1)) * n)));
      const r = raw[k];
      return r.rIn < 0 ? null : { rIn: r.rIn + inset, rOut: Math.min(rOut[k], r.rOut + inset * 4) - inset };
    },
  };
}

/** sampel grid di dalam zona + koordinat kedalaman f */
function zoneSamples(poly: Pt[], c: Pt, step: number, inset: number, radial: boolean): Sample[] {
  if (radial) {
    const prof = radialProfile(poly, c, inset);
    const xs = poly.map((p) => p[0]);
    const ys = poly.map((p) => p[1]);
    const out: Sample[] = [];
    for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step)
      for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) {
        const p: Pt = [x, y];
        if (!pointInPolygon(p, poly) || edgeDistance(p, poly) < inset) continue;
        const th = thetaOf(p, c);
        const pr = prof.get(th);
        if (!pr || pr.rOut <= pr.rIn) continue;
        const r = Math.hypot(p[0] - c[0], p[1] - c[1]);
        const f = (r - pr.rIn) / (pr.rOut - pr.rIn);
        if (f < 0 || f > 1) continue;
        out.push({ p, f, th });
      }
    return out;
  }
  const { front, back } = frontBack(poly, c);
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const samples: Sample[] = [];
  for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step)
    for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) {
      const p: Pt = [x, y];
      if (!pointInPolygon(p, poly) || edgeDistance(p, poly) < inset) continue;
      const dF = chainDistance(p, front);
      // tepi belakang: jarak ke rantai belakang, tapi tidak lebih jauh dari
      // tepi poligon terdekat di arah menjauhi island (lekukan zona lain)
      const dB = chainDistance(p, back);
      samples.push({ p, f: dF / (dF + dB || 1), th: thetaOf(p, c) });
    }
  return samples;
}

/**
 * Garis tengah satu baris di satu zona: sampel di sekitar f = fc,
 * dikelompokkan per sudut dari island, dirata-rata, lalu dipecah di
 * celah besar (zona dengan dua lengan).
 */
function rowLines(samples: Sample[], fc: number, halfBand: number, c: Pt, step: number): Pt[][] {
  const strip = samples.filter((s) => Math.abs(s.f - fc) <= halfBand);
  if (!strip.length) return [];
  const rAvg = strip.reduce((a, s) => a + Math.hypot(s.p[0] - c[0], s.p[1] - c[1]), 0) / strip.length;
  const bw = (step * 1.5) / Math.max(rAvg, 1);
  const bins = new Map<number, { x: number; y: number; th: number; n: number }>();
  for (const s of strip) {
    const k = Math.floor(s.th / bw);
    const b = bins.get(k) ?? { x: 0, y: 0, th: 0, n: 0 };
    b.x += s.p[0];
    b.y += s.p[1];
    b.th += s.th;
    b.n++;
    bins.set(k, b);
  }
  const pts = [...bins.values()]
    .map((b) => ({ p: [b.x / b.n, b.y / b.n] as Pt, th: b.th / b.n }))
    .sort((a, b) => a.th - b.th);
  const segs: Pt[][] = [[]];
  for (let i = 0; i < pts.length; i++) {
    if (i && Math.hypot(pts[i].p[0] - pts[i - 1].p[0], pts[i].p[1] - pts[i - 1].p[1]) > step * 5) segs.push([]);
    segs[segs.length - 1].push(pts[i].p);
  }
  return segs.filter((s) => s.length >= 2).map(smooth);
}

/** rata-rata bergerak 2 putaran, ujung tetap */
function smooth(line: Pt[]): Pt[] {
  let cur = line;
  for (let pass = 0; pass < 2; pass++)
    cur = cur.map((p, i) => {
      if (i === 0 || i === cur.length - 1) return p;
      const r = Math.min(2, i, cur.length - 1 - i);
      let sx = 0;
      let sy = 0;
      for (let k = i - r; k <= i + r; k++) {
        sx += cur[k][0];
        sy += cur[k][1];
      }
      return [sx / (2 * r + 1), sy / (2 * r + 1)] as Pt;
    });
  return cur;
}

function polylineLength(line: Pt[]): number {
  let L = 0;
  for (let i = 0; i + 1 < line.length; i++) L += Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]);
  return L;
}

/** sebar `count` titik merata sepanjang polyline (setengah jarak di ujung) */
function resampleAlong(line: Pt[], count: number): Pt[] {
  if (count <= 0) return [];
  if (line.length < 2) return Array.from({ length: count }, () => line[0]);
  const seg: number[] = [];
  for (let i = 0; i + 1 < line.length; i++) seg.push(Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]));
  const total = seg.reduce((a, b) => a + b, 0);
  const out: Pt[] = [];
  let si = 0;
  let acc = 0;
  for (let k = 0; k < count; k++) {
    const target = (total * (k + 0.5)) / count;
    while (si < seg.length - 1 && acc + seg[si] < target) acc += seg[si++];
    const t = seg[si] ? Math.min(1, (target - acc) / seg[si]) : 0;
    out.push([line[si][0] + (line[si + 1][0] - line[si][0]) * t, line[si][1] + (line[si + 1][1] - line[si][1]) * t]);
  }
  return out;
}

/* ---------------- builder ---------------- */

export function buildSeatGrid(layout: CategoryLayout): SeatGrid {
  const zones = planZonesOf(layout.category).map((z) => parsePlanPoints(z.points) as Pt[]);
  const stage = parsePlanPoints(PLAN_STAGE) as Pt[];
  const island = PLAN_ISLAND as Pt;
  if (!zones.length) return finish({ seats: [], rows: [] }, zones, stage, island, 4);

  const nRows = layout.rows.length;
  const totalArea = zones.reduce((a, z) => a + polygonArea(z), 0);
  const unit = Math.sqrt(totalArea / layout.capacity); // ~ jarak antar-kursi
  const inset = Math.max(0.8, unit * 0.4);
  const step = Math.max(0.6, Math.min(2, unit / 4));
  // tribun yang melingkari island (CAT 4-7) pakai kedalaman radial;
  // floor (CAT 1-3) pakai jarak ke tepi depan/belakang
  const radial = true;
  const zs = zones.map((z) => zoneSamples(z, island, step, inset, radial));
  const halfBand = 0.25 / nRows;

  const seats: GridSeat[] = [];
  const rows: GridRow[] = [];
  layout.rows.forEach((row, ri) => {
    const fc = (ri + 0.5) / nRows;
    const segs: { line: Pt[]; zone: number }[] = [];
    zs.forEach((z, zi) => {
      for (const line of rowLines(z, fc, halfBand, island, step)) segs.push({ line, zone: zi });
    });
    const need = row.blocks.reduce((a, b) => a + b, 0);
    const lens = segs.map((s) => polylineLength(s.line));
    // potongan lebih pendek dari 1 kursi diabaikan (kalau masih ada yang lain)
    const usable = lens.map((L) => (L >= unit ? L : 0));
    const counts = apportion(need, usable.some((L) => L > 0) ? usable : lens);

    const pts: { p: Pt; zone: number; th: number }[] = [];
    segs.forEach((sg, i) => {
      for (const p of resampleAlong(sg.line, counts[i])) pts.push({ p, zone: sg.zone, th: thetaOf(p, island) });
    });
    // kiri penonton (menghadap island) = θ lebih besar
    pts.sort((a, b) => b.th - a.th);
    const order = visualBlocks(row, layout.numbering).flat();
    const path: Pt[][] = [];
    let curZone = -1;
    pts.forEach(({ p, zone }, k) => {
      const n = order[k];
      if (n === undefined) return;
      const a = Math.atan2(island[1] - p[1], island[0] - p[0]);
      seats.push({ row: row.label, n, x: p[0], y: p[1], angle: (a * 180) / Math.PI + 90, block: zone, size: 0 });
      if (zone !== curZone) {
        path.push([]);
        curZone = zone;
      }
      path[path.length - 1].push(p);
    });
    const label = (p: Pt | undefined, sign: number): Pt => {
      if (!p) return island;
      const r = Math.hypot(p[0] - island[0], p[1] - island[1]) || 1;
      const th = thetaOf(p, island) + (sign * unit * 1.3) / r;
      return [island[0] - r * Math.cos(th), island[1] + r * Math.sin(th)];
    };
    rows.push({ row: row.label, left: label(pts[0]?.p, 1), right: label(pts[pts.length - 1]?.p, -1), path });
  });

  const seat = sizeSeats(seats);
  return finish({ seats, rows }, zones, stage, island, seat);
}

/** Tetapkan `size` tiap kursi; kembalikan ukuran patokan (mayoritas kursi). */
function sizeSeats(seats: GridSeat[]): number {
  if (!seats.length) return 4;
  if (seats.length === 1) {
    seats[0].size = SEAT_MAX;
    return SEAT_MAX;
  }
  const cell = 14;
  const grid = new Map<string, GridSeat[]>();
  for (const s of seats) {
    const k = `${Math.floor(s.x / cell)}|${Math.floor(s.y / cell)}`;
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(s);
  }
  const near = (s: GridSeat) => {
    const out: GridSeat[] = [];
    const cx = Math.floor(s.x / cell);
    const cy = Math.floor(s.y / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) out.push(...(grid.get(`${cx + dx}|${cy + dy}`) ?? []));
    return out;
  };
  const nn = new Map<GridSeat, number>();
  for (const s of seats) {
    let m = Infinity;
    for (const o of near(s)) if (o !== s) m = Math.min(m, Math.hypot(o.x - s.x, o.y - s.y));
    nn.set(s, m);
  }
  // patokan = persentil 25 (tahan terhadap beberapa pasang yang mepet)
  const ds = [...nn.values()].filter(Number.isFinite).sort((a, b) => a - b);
  const base = Math.min(SEAT_MAX, Math.max(1.2, (ds[Math.floor(ds.length * 0.25)] ?? SEAT_MAX) * 0.86));
  for (const s of seats) s.size = Math.max(0.5, Math.min(base, (nn.get(s) ?? base) * 0.86));
  // pastikan pasangan mepet sama-sama muat
  for (let iter = 0; iter < 3; iter++) {
    let changed = false;
    for (const s of seats)
      for (const o of near(s)) {
        if (o === s) continue;
        const d = Math.hypot(o.x - s.x, o.y - s.y);
        if (d < (s.size + o.size) / 2 - 1e-9) {
          const r = Math.max(0.4, d * 0.95);
          if (s.size > r) ((s.size = r), (changed = true));
          if (o.size > r) ((o.size = r), (changed = true));
        }
      }
    if (!changed) break;
  }
  return base;
}

function finish(
  res: { seats: GridSeat[]; rows: GridRow[] },
  zones: Pt[][],
  stage: Pt[],
  island: Pt,
  seat: number,
): SeatGrid {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const z of zones) for (const [x, y] of z) (xs.push(x), ys.push(y));
  for (const r of res.rows) (xs.push(r.left[0], r.right[0]), ys.push(r.left[1], r.right[1]));
  const pad = 16;
  let x = Math.max(0, Math.min(...xs) - pad);
  let y = Math.max(0, Math.min(...ys) - pad);
  let x2 = Math.min(PLAN_SIZE.width, Math.max(...xs) + pad);
  // ruang tombol zoom di bawah
  let y2 = Math.min(PLAN_SIZE.height, Math.max(...ys) + pad * 2.6);
  if (!xs.length) ((x = 0), (y = 0), (x2 = PLAN_SIZE.width), (y2 = PLAN_SIZE.height));
  return { ...res, zones, stage, island, seat, bbox: { x, y, width: x2 - x, height: y2 - y } };
}
