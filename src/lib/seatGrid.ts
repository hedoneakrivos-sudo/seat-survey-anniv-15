import type { CategoryLayout } from '../config/seatLayout';
import { visualBlocks } from './layout';

/**
 * Denah kursi 2D tampak atas (gaya bioskop) untuk satu CAT.
 *
 * Panggung di atas, Row A paling dekat panggung, tiap blok dipisah
 * lorong. Bentuknya mengikuti tipe zona CAT itu di seatplan:
 * - 'grid': floor (CAT 1-3), baris lurus seperti bioskop.
 * - 'arc' : tribun (CAT 4-7), baris melengkung mengelilingi panggung.
 *
 * Satuan bebas (1 kursi = PITCH unit). Koordinat dipakai langsung
 * sebagai viewBox SVG.
 */

export type Pt = [number, number];

export const PITCH = 10; // jarak antar-kursi dalam satu baris
export const SEAT = 8; // sisi kotak kursi
export const ROW_GAP = 13; // jarak antar-baris
export const AISLE = 18; // lebar lorong antar-blok

export interface GridSeat {
  row: string;
  n: number;
  x: number;
  y: number;
  /** rotasi kursi (derajat), 0 = menghadap ke atas (panggung) */
  angle: number;
  block: number;
}

export interface GridRow {
  row: string;
  /** titik label kiri & kanan baris */
  left: Pt;
  right: Pt;
  /** garis tengah baris per blok (buat sorotan) */
  path: Pt[][];
}

export type GridStage =
  | { kind: 'bar'; x: number; y: number; width: number; height: number }
  | { kind: 'arc'; d: string; label: Pt; corners: Pt[] };

export interface SeatGrid {
  seats: GridSeat[];
  rows: GridRow[];
  blocks: { name: string; x: number; y: number; angle: number }[];
  stage: GridStage;
  bbox: { x: number; y: number; width: number; height: number };
}

type Shape = { kind: 'grid' } | { kind: 'arc'; spanDeg: number };

/** Tipe bentuk tiap CAT, disesuaikan dengan zonanya di seatplan */
export const CAT_SHAPE: Record<number, Shape> = {
  1: { kind: 'grid' },
  2: { kind: 'grid' },
  3: { kind: 'grid' },
  4: { kind: 'arc', spanDeg: 110 },
  5: { kind: 'arc', spanDeg: 120 },
  6: { kind: 'arc', spanDeg: 110 },
  7: { kind: 'arc', spanDeg: 130 },
};

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function buildSeatGrid(layout: CategoryLayout): SeatGrid {
  const shape = CAT_SHAPE[layout.category] ?? { kind: 'grid' };
  const rows = layout.rows.map((r) => visualBlocks(r, layout.numbering));
  const nBlocks = Math.max(1, ...layout.rows.map((r) => r.blocks.length));
  const g = shape.kind === 'arc' ? buildArc(layout, rows, nBlocks, shape.spanDeg) : buildFlat(layout, rows, nBlocks);
  g.bbox = bboxOf(g, 24);
  return g;
}

/* ---------------- floor: baris lurus ---------------- */

function buildFlat(layout: CategoryLayout, rows: number[][][], nBlocks: number): SeatGrid {
  // lebar kolom blok = baris terpanjang di blok itu, jadi lorong lurus dari depan ke belakang
  const colW = Array.from({ length: nBlocks }, (_, b) => Math.max(1, ...rows.map((r) => r[b]?.length ?? 0)) * PITCH);
  const total = colW.reduce((a, w) => a + w, 0) + AISLE * (nBlocks - 1);
  const colX: number[] = [];
  let x = -total / 2;
  for (const w of colW) {
    colX.push(x + w / 2);
    x += w + AISLE;
  }

  const seats: GridSeat[] = [];
  const outRows: GridRow[] = [];
  rows.forEach((blocks, ri) => {
    const y = ri * ROW_GAP;
    const path: Pt[][] = [];
    blocks.forEach((nums, b) => {
      const start = colX[b] - ((nums.length - 1) * PITCH) / 2;
      const line: Pt[] = [];
      nums.forEach((n, k) => {
        const sx = start + k * PITCH;
        seats.push({ row: layout.rows[ri].label, n, x: sx, y, angle: 0, block: b });
        line.push([sx, y]);
      });
      if (line.length) path.push(line);
    });
    const first = path[0]?.[0] ?? [0, y];
    const last = path[path.length - 1]?.at(-1) ?? [0, y];
    outRows.push({
      row: layout.rows[ri].label,
      left: [first[0] - PITCH * 1.4, y],
      right: [last[0] + PITCH * 1.4, y],
      path,
    });
  });

  const backY = (rows.length - 1) * ROW_GAP;
  return {
    seats,
    rows: outRows,
    blocks: layout.blockNames.slice(0, nBlocks).map((name, b) => ({ name, x: colX[b], y: backY + ROW_GAP * 1.6, angle: 0 })),
    stage: { kind: 'bar', x: -total / 2, y: -ROW_GAP * 3.2, width: total, height: ROW_GAP * 1.8 },
    bbox: { x: 0, y: 0, width: 0, height: 0 },
  };
}

/* ---------------- tribun: baris melengkung ---------------- */

function buildArc(layout: CategoryLayout, rows: number[][][], nBlocks: number, spanDeg: number): SeatGrid {
  const span = rad(spanDeg);
  const radiusOf = (R0: number, ri: number) => R0 + ri * ROW_GAP;
  // sudut yang dibutuhkan blok b = baris paling "makan sudut" di blok itu
  const blockAngles = (R0: number) =>
    Array.from({ length: nBlocks }, (_, b) =>
      Math.max(...rows.map((r, ri) => ((r[b]?.length ?? 0) * PITCH) / radiusOf(R0, ri))),
    );
  const need = (R0: number) => blockAngles(R0).reduce((a, v) => a + v, 0) + ((nBlocks - 1) * AISLE) / R0;

  // cari radius depan supaya seluruh CAT pas di rentang sudut `span`
  let lo = 20;
  let hi = 20000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (need(mid) > span) lo = mid;
    else hi = mid;
  }
  const R0 = hi;
  const angles = blockAngles(R0);
  const aisleA = AISLE / R0;
  const totalA = angles.reduce((a, v) => a + v, 0) + aisleA * (nBlocks - 1);

  // pusat lingkaran di atas; arah "bawah" layar = sudut 90°
  // kiri layar = sudut lebih besar (cos negatif)
  const centers: number[] = [];
  let a = Math.PI / 2 + totalA / 2;
  for (const w of angles) {
    centers.push(a - w / 2);
    a -= w + aisleA;
  }
  const at = (R: number, t: number): Pt => [R * Math.cos(t), R * Math.sin(t)];

  const seats: GridSeat[] = [];
  const outRows: GridRow[] = [];
  rows.forEach((blocks, ri) => {
    const R = radiusOf(R0, ri);
    const dA = PITCH / R;
    const path: Pt[][] = [];
    let leftT = -Infinity;
    let rightT = Infinity;
    blocks.forEach((nums, b) => {
      const start = centers[b] + ((nums.length - 1) * dA) / 2;
      const line: Pt[] = [];
      nums.forEach((n, k) => {
        const t = start - k * dA;
        const [sx, sy] = at(R, t);
        seats.push({ row: layout.rows[ri].label, n, x: sx, y: sy, angle: deg(t - Math.PI / 2), block: b });
        line.push([sx, sy]);
        leftT = Math.max(leftT, t);
        rightT = Math.min(rightT, t);
      });
      if (line.length) path.push(line);
    });
    const pad = (PITCH * 1.4) / R;
    outRows.push({
      row: layout.rows[ri].label,
      left: at(R, leftT + pad),
      right: at(R, rightT - pad),
      path,
    });
  });

  // panggung: pita melengkung di depan Row A
  const r1 = R0 - ROW_GAP * 1.4;
  const r2 = Math.max(4, R0 - ROW_GAP * 3.2);
  const t0 = Math.PI / 2 + totalA / 2;
  const t1 = Math.PI / 2 - totalA / 2;
  const [ax, ay] = at(r1, t0);
  const [bx, by] = at(r1, t1);
  const [cx, cy] = at(r2, t1);
  const [dx, dy] = at(r2, t0);
  const large = totalA > Math.PI ? 1 : 0;
  const d = `M${ax},${ay} A${r1},${r1} 0 ${large} 0 ${bx},${by} L${cx},${cy} A${r2},${r2} 0 ${large} 1 ${dx},${dy} Z`;

  const backR = radiusOf(R0, rows.length - 1) + ROW_GAP * 1.6;
  return {
    seats,
    rows: outRows,
    blocks: layout.blockNames.slice(0, nBlocks).map((name, b) => {
      const [x, y] = at(backR, centers[b]);
      return { name, x, y, angle: deg(centers[b] - Math.PI / 2) };
    }),
    stage: {
      kind: 'arc',
      d,
      label: at((r1 + r2) / 2, Math.PI / 2),
      corners: [[ax, ay], [bx, by], [cx, cy], [dx, dy], at(r2, Math.PI / 2)],
    },
    bbox: { x: 0, y: 0, width: 0, height: 0 },
  };
}

/* ---------------- util ---------------- */

function bboxOf(g: SeatGrid, pad: number) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const s of g.seats) {
    xs.push(s.x);
    ys.push(s.y);
  }
  for (const r of g.rows) {
    xs.push(r.left[0], r.right[0]);
    ys.push(r.left[1], r.right[1]);
  }
  for (const b of g.blocks) {
    xs.push(b.x);
    ys.push(b.y);
  }
  if (g.stage.kind === 'bar') {
    xs.push(g.stage.x, g.stage.x + g.stage.width);
    ys.push(g.stage.y, g.stage.y + g.stage.height);
  } else {
    for (const [px, py] of g.stage.corners) {
      xs.push(px);
      ys.push(py);
    }
  }
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  // ruang ekstra di bawah untuk tombol zoom (pojok kanan bawah)
  return { x, y, width: Math.max(...xs) + pad - x, height: Math.max(...ys) + pad * 2.6 - y };
}
