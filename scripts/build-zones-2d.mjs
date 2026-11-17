/**
 * Segmentasi Seatplan_2D.png jadi poligon zona per CAT, lalu tulis
 * src/config/seatZones2d.ts.
 *
 *   node scripts/build-zones-2d.mjs [path/ke/Seatplan_2D.png]
 *
 * Caranya: tiap piksel dicocokkan ke warna CAT terdekat (jarak RGB),
 * piksel sewarna yang bersambung dikelompokkan (flood fill), lalu tepi
 * luar tiap kelompok ditelusuri (moore boundary) dan disederhanakan
 * (Ramer-Douglas-Peucker). Koordinat dinormalisasi ke ruang 1000 x H.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

/* ---------------- baca PNG (truecolor 8-bit, non-interlaced) ---------------- */

function readPng(path) {
  const b = readFileSync(path);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error('bukan PNG');
  let o = 8;
  let w = 0;
  let h = 0;
  let ct = 0;
  const idat = [];
  while (o < b.length) {
    const len = b.readUInt32BE(o);
    const type = b.toString('ascii', o + 4, o + 8);
    const d = b.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      w = d.readUInt32BE(0);
      h = d.readUInt32BE(4);
      if (d[8] !== 8) throw new Error('butuh 8-bit per kanal');
      ct = d[9];
      if (d[12] !== 0) throw new Error('PNG interlaced belum didukung');
    } else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    o += 12 + len;
  }
  if (ct !== 2 && ct !== 6) throw new Error('butuh PNG RGB/RGBA');
  const bpp = ct === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const px = Buffer.alloc(w * h * 3);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const up = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += up;
      else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) {
        const p = a + up - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      }
      line[i] = v & 255;
    }
    for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) px[(y * w + x) * 3 + k] = line[x * bpp + k];
    prev = line;
  }
  return { w, h, px };
}

/* ---------------- warna CAT (dari legenda poster) ---------------- */

const CATS = [
  { cat: 1, rgb: [0xf8, 0x38, 0x38] }, // merah
  { cat: 2, rgb: [0xf8, 0xf8, 0x18] }, // kuning
  { cat: 3, rgb: [0xa8, 0x38, 0xf8] }, // ungu
  { cat: 4, rgb: [0xf8, 0x68, 0x28] }, // oranye
  { cat: 5, rgb: [0x58, 0xe8, 0x48] }, // hijau
  { cat: 6, rgb: [0x58, 0x98, 0xf8] }, // biru
  { cat: 7, rgb: [0xf8, 0x88, 0xc8] }, // pink
];
// warna non-CAT: putih kertas, abu panggung, garis hitam
const IGNORE = [
  [0xff, 0xff, 0xff],
  [0xf8, 0xf8, 0xf8],
  [0xe8, 0xe8, 0xe8],
  [0xd8, 0xd8, 0xd8],
  [0x08, 0x08, 0x08],
  [0x18, 0x18, 0x18],
  [0x28, 0x28, 0x28],
  [0x80, 0x80, 0x80],
];
const d2 = (p, i, c) => (p[i] - c[0]) ** 2 + (p[i + 1] - c[1]) ** 2 + (p[i + 2] - c[2]) ** 2;

/** CAT tiap piksel, atau 0 kalau bukan zona (putih/abu/garis/antialias) */
function classify({ w, h, px }) {
  const map = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < w * h; i++, p += 3) {
    let best = 0;
    let bd = Infinity;
    for (const c of CATS) {
      const d = d2(px, p, c.rgb);
      if (d < bd) {
        bd = d;
        best = c.cat;
      }
    }
    let bi = Infinity;
    for (const c of IGNORE) bi = Math.min(bi, d2(px, p, c));
    // piksel diambil hanya kalau jelas lebih dekat ke warna CAT
    map[i] = bd < bi && bd < 70 ** 2 ? best : 0;
    // abu panggung (bukan putih kertas)
    if (!map[i] && d2(px, p, [0xe8, 0xe8, 0xe8]) < 12 ** 2) map[i] = 9;
  }
  return map;
}

/* ---------------- kelompokkan piksel sewarna yang bersambung ---------------- */

function components(map, w, h) {
  const seen = new Uint8Array(map.length);
  const out = [];
  const stack = new Int32Array(map.length);
  for (let s = 0; s < map.length; s++) {
    if (!map[s] || seen[s]) continue;
    const cat = map[s];
    let top = 0;
    stack[top++] = s;
    seen[s] = 1;
    const cells = [];
    while (top) {
      const i = stack[--top];
      cells.push(i);
      const x = i % w;
      const y = (i / w) | 0;
      if (x > 0 && !seen[i - 1] && map[i - 1] === cat) (seen[i - 1] = 1), (stack[top++] = i - 1);
      if (x < w - 1 && !seen[i + 1] && map[i + 1] === cat) (seen[i + 1] = 1), (stack[top++] = i + 1);
      if (y > 0 && !seen[i - w] && map[i - w] === cat) (seen[i - w] = 1), (stack[top++] = i - w);
      if (y < h - 1 && !seen[i + w] && map[i + w] === cat) (seen[i + w] = 1), (stack[top++] = i + w);
    }
    out.push({ cat, cells });
  }
  return out;
}

/**
 * Rapikan mask: closing (isi celah antialias & lubang kecil) lalu
 * opening (buang tonjolan tipis). r = radius kotak dalam piksel.
 */
function cleanMask(mask, w, h, r = 2) {
  const morph = (m, dilate) => {
    const o = new Uint8Array(m.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        // dilate: 1 kalau ada tetangga 1; erode: 0 kalau ada tetangga 0
        let v = dilate ? 0 : 1;
        scan: for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            const s = nx < 0 || ny < 0 || nx >= w || ny >= h ? 0 : m[ny * w + nx];
            if (dilate && s) {
              v = 1;
              break scan;
            }
            if (!dilate && !s) {
              v = 0;
              break scan;
            }
          }
        o[y * w + x] = v;
      }
    return o;
  };
  return morph(morph(morph(morph(mask, true), false), false), true);
}

/** potong mask ke bbox komponen (+margin) supaya morfologi cepat */
function cropMask(cells, w, pad) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (const i of cells) {
    const x = i % w;
    const y = (i / w) | 0;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  x0 -= pad;
  y0 -= pad;
  const cw = x1 - x0 + 1 + pad;
  const ch = y1 - y0 + 1 + pad;
  const m = new Uint8Array(cw * ch);
  for (const i of cells) {
    const x = (i % w) - x0;
    const y = ((i / w) | 0) - y0;
    m[y * cw + x] = 1;
  }
  return { m, cw, ch, x0, y0 };
}

/* ---------------- telusuri tepi luar (moore neighbor tracing) ---------------- */

function traceOutline(mask, w, h) {
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : mask[y * w + x]);
  let sx = -1;
  let sy = -1;
  for (let y = 0; y < h && sx < 0; y++) for (let x = 0; x < w; x++) if (at(x, y)) ((sx = x), (sy = y)); // eslint-disable-line
  if (sx < 0) return [];
  const N = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ];
  const pts = [[sx, sy]];
  let cx = sx;
  let cy = sy;
  let dir = 6; // mulai cari ke atas
  for (let guard = 0; guard < w * h * 8; guard++) {
    let moved = false;
    for (let k = 0; k < 8; k++) {
      const nd = (dir + k) % 8;
      const nx = cx + N[nd][0];
      const ny = cy + N[nd][1];
      if (at(nx, ny)) {
        cx = nx;
        cy = ny;
        dir = (nd + 5) % 8; // mundur 3 arah, lalu cari lagi
        pts.push([cx, cy]);
        moved = true;
        break;
      }
    }
    if (!moved) break;
    if (cx === sx && cy === sy && pts.length > 2) break;
  }
  return pts;
}

/** sederhanakan polyline, toleransi dalam piksel */
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0];
  const [bx, by] = pts[pts.length - 1];
  const L = Math.hypot(bx - ax, by - ay) || 1;
  let worst = 0;
  let wi = -1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((pts[i][0] - ax) * (by - ay) - (pts[i][1] - ay) * (bx - ax)) / L;
    if (d > worst) {
      worst = d;
      wi = i;
    }
  }
  if (worst <= eps) return [pts[0], pts[pts.length - 1]];
  return [...rdp(pts.slice(0, wi + 1), eps).slice(0, -1), ...rdp(pts.slice(wi), eps)];
}

const area = (p) => Math.abs(p.reduce((s, [x, y], i) => { const [nx, ny] = p[(i + 1) % p.length]; return s + x * ny - nx * y; }, 0)) / 2;

/* ---------------- main ---------------- */

const src = process.argv[2] ?? 'Seatplan_2D.png';
const img = readPng(src);
const { w, h } = img;
const map = classify(img);
const allComps = components(map, w, h);
if (process.env.DEBUG) {
  const per = {};
  for (const v of map) if (v) per[v] = (per[v] || 0) + 1;
  console.log("px per CAT", JSON.stringify(per));
  console.log("komponen", allComps.length, allComps.filter((c) => c.cells.length > 500).map((c) => c.cat + ":" + c.cells.length).join(" "));
}
const comps = allComps.filter((c) => c.cells.length >= 1500 && c.cat !== 9);
const stageComp = allComps.filter((c) => c.cat === 9).sort((a, b) => b.cells.length - a.cells.length)[0];

// skala: lebar jadi 1000 unit, tinggi proporsional
const S = 1000 / w;
const H = Math.round(h * S);

const zones = [];
for (const c of comps) {
  const pad = 6;
  const { m, cw, ch, x0, y0 } = cropMask(c.cells, w, pad);
  const mask = cleanMask(m, cw, ch, 2);
  if (!mask.some(Boolean)) continue;
  const outline = traceOutline(mask, cw, ch);
  if (outline.length < 8) continue;
  // tepi hasil tracing bergerigi 1px; eps 2.5px cukup untuk menghaluskan
  // ring tertutup: pecah di titik terjauh dari titik awal, sederhanakan dua sisi
  let far = 0;
  let fd = -1;
  outline.forEach(([x, y], i) => {
    const d = (x - outline[0][0]) ** 2 + (y - outline[0][1]) ** 2;
    if (d > fd) {
      fd = d;
      far = i;
    }
  });
  let poly = [...rdp(outline.slice(0, far + 1), 2.5).slice(0, -1), ...rdp([...outline.slice(far), outline[0]], 2.5).slice(0, -1)];
  if (poly.length < 3 || area(poly) < 1200) continue;
  poly = poly.map(([x, y]) => [Math.round((x + x0) * S * 10) / 10, Math.round((y + y0) * S * 10) / 10]);
  zones.push({ cat: c.cat, px: c.cells.length, poly });
}

zones.sort((a, b) => a.cat - b.cat || b.px - a.px);

// panggung: tepi luar + titik tengah island (lingkaran paling kiri)
let stagePts = '';
let island = [0, 0];
if (stageComp) {
  const pad = 6;
  const { m, cw, ch, x0, y0 } = cropMask(stageComp.cells, w, pad);
  const mask = cleanMask(m, cw, ch, 2);
  const outline = traceOutline(mask, cw, ch);
  let far = 0;
  let fd = -1;
  outline.forEach(([x, y], i) => {
    const d = (x - outline[0][0]) ** 2 + (y - outline[0][1]) ** 2;
    if (d > fd) ((fd = d), (far = i));
  });
  const poly = [...rdp(outline.slice(0, far + 1), 2).slice(0, -1), ...rdp([...outline.slice(far), outline[0]], 2).slice(0, -1)];
  stagePts = poly.map(([x, y]) => `${Math.round((x + x0) * S * 10) / 10},${Math.round((y + y0) * S * 10) / 10}`).join(' ');
  // island: kolom paling kiri yang abu, lalu cari tinggi lingkarannya di sana
  let minX = Infinity;
  for (const i of stageComp.cells) minX = Math.min(minX, i % w);
  const colYs = (x) => stageComp.cells.filter((i) => i % w === x).map((i) => (i / w) | 0);
  const left = colYs(minX + 2);
  const cy = (Math.min(...left) + Math.max(...left)) / 2;
  // radius = setengah tinggi lingkaran di kolom ~ minX + r; cari lebar maks di sekitar kiri
  let r = 0;
  for (let x = minX; x < minX + 400; x += 2) {
    const ys = colYs(x).filter((y) => Math.abs(y - cy) < 200);
    if (!ys.length) continue;
    const half = (Math.max(...ys) - Math.min(...ys)) / 2;
    if (half >= r) r = half;
    else break;
  }
  island = [Math.round((minX + r) * S * 10) / 10, Math.round(cy * S * 10) / 10];
}
const letters = 'abcdefgh';
const byCat = new Map();
const lines = zones.map((z) => {
  const n = byCat.get(z.cat) ?? 0;
  byCat.set(z.cat, n + 1);
  return `  { id: 'cat${z.cat}-${letters[n]}', category: ${z.cat}, points: '${z.poly.map((p) => p.join(',')).join(' ')}' },`;
});

const ts = `/**
 * ============================================================
 *  ZONA SEATPLAN 2D (tampak atas) — DIBUAT OTOMATIS
 * ============================================================
 * Dihasilkan oleh scripts/build-zones-2d.mjs dari ${src}
 * (segmentasi warna + penelusuran tepi). JANGAN diedit manual;
 * ubah gambarnya lalu jalankan ulang skripnya.
 *
 * Ruang koordinat: ${1000} x ${H} (lebar gambar dinormalisasi ke 1000).
 * Panggung ada di KANAN, sama seperti di gambar.
 */

export const PLAN_SIZE = { width: 1000, height: ${H} } as const;

export interface PlanZone {
  id: string;
  category: number;
  /** "x,y x,y ..." di ruang PLAN_SIZE */
  points: string;
}

/** siluet panggung (main stage + catwalk + island) */
export const PLAN_STAGE = '${stagePts}';

/** titik tengah island stage; baris kursi disusun menghadap titik ini */
export const PLAN_ISLAND: [number, number] = [${island[0]}, ${island[1]}];

export const PLAN_ZONES: PlanZone[] = [
${lines.join('\n')}
];

export function planZonesOf(category: number): PlanZone[] {
  return PLAN_ZONES.filter((z) => z.category === category);
}

export function parsePlanPoints(points: string): [number, number][] {
  return points
    .trim()
    .split(/\\s+/)
    .map((p) => p.split(',').map(Number) as [number, number]);
}
`;
writeFileSync('src/config/seatZones2d.ts', ts);
console.log(`${zones.length} zona → src/config/seatZones2d.ts (ruang 1000x${H}), island ${island}`);
for (const [cat, n] of [...byCat].sort((a, b) => a[0] - b[0])) {
  const px = zones.filter((z) => z.cat === cat).map((z) => z.px);
  console.log(`  CAT ${cat}: ${n} zona, px ${px.join(', ')}`);
}

/* ---------------- verifikasi: poligon vs piksel asli ---------------- */
if (process.env.VERIFY) {
  const inside = ([x, y], poly) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  for (const z of zones) {
    const P = z.poly.map(([x, y]) => [x / S, y / S]);
    let hit = 0;
    let tot = 0;
    const xs = P.map((p) => p[0]);
    const ys = P.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y < Math.max(...ys); y += 3)
      for (let x = Math.floor(Math.min(...xs)); x < Math.max(...xs); x += 3) {
        if (!inside([x, y], P)) continue;
        tot++;
        if (map[y * w + x] === z.cat) hit++;
      }
    console.log(`CAT ${z.cat} ${z.poly.length} titik · isi sesuai warna ${((hit / tot) * 100).toFixed(1)}% · cakupan ${((tot * 9) / z.px * 100).toFixed(0)}%`);
  }
}
