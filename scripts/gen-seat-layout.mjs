// Generator estimasi seatLayout dari kuota tiket per CAT.
// Edit SPEC (kuota, jumlah baris, spread, rasio blok) lalu jalankan:
//   node scripts/gen-seat-layout.mjs src/config/seatLayout.ts
// Bagi kuota tiket per CAT ke baris & blok dengan total yang pas.
// rowTotals: jumlah kursi per baris (makin belakang makin panjang)
// ratios: porsi tiap blok dalam satu baris
function rowTotals(total, n, spread) {
  // pola linear: baris depan (1 - spread/2) x rata-rata, belakang (1 + spread/2) x
  const avg = total / n;
  const raw = Array.from({ length: n }, (_, i) => avg * (1 - spread / 2 + (spread * i) / Math.max(1, n - 1)));
  const out = raw.map(Math.floor);
  let rest = total - out.reduce((a, b) => a + b, 0);
  // sisa dibagi ke baris dengan pecahan terbesar
  const order = raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; rest > 0; k++, rest--) out[order[k % n][1]]++;
  return out;
}
function split(n, ratios) {
  const raw = ratios.map((r) => n * r);
  const out = raw.map(Math.floor);
  let rest = n - out.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; rest > 0; k++, rest--) out[order[k][1]]++;
  return out;
}
const L = (n) => Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));

const SPEC = [
  // cat, kuota, jumlah baris, spread, rasio blok
  [1, 60, 3, 0, [0.5, 0.5]],
  [2, 356, 8, 0.2, [0.5, 0.5]],
  [3, 552, 12, 0.24, [0.3, 0.48, 0.22]],
  [4, 746, 10, 0.18, [0.5, 0.5]],
  [5, 596, 8, 0.2, [0.3, 0.4, 0.3]],
  [6, 718, 14, 0.3, [0.34, 0.33, 0.33]],
  [7, 212, 4, 0, [0.23, 0.28, 0.49]],
];
for (const [cat, total, n, spread, ratios] of SPEC) {
  const totals = rowTotals(total, n, spread);
  const rows = totals.map((t, i) => ({ label: L(n)[i], blocks: split(t, ratios) }));
  const sum = rows.reduce((a, r) => a + r.blocks.reduce((x, y) => x + y, 0), 0);
  console.log(`CAT ${cat} kuota=${total} sum=${sum} ${sum === total ? 'OK' : 'SALAH'}`);
  console.log('  ' + rows.map((r) => `${r.label}:[${r.blocks.join(',')}]`).join(' '));
}

// ---------- tulis seatLayout.ts ----------
import { writeFileSync } from 'node:fs';
const META = {
  1: { gates: ['1', '2'], blocks: ['Kiri', 'Kanan'], note: '2 potongan kecil di samping stage' },
  2: { gates: ['1', '2', '3'], blocks: ['Kiri Island', 'Kanan Island'], note: '2 blok di kiri-kanan island stage' },
  3: { gates: ['2', '3', '4'], blocks: ['Atas', 'Tengah', 'Kanan Bawah'], note: 'floor depan + potongan atas + potongan kanan bawah' },
  4: { gates: ['4', '5'], blocks: ['Atas', 'Kanan Bawah'], note: 'tribun melengkung atas & kanan bawah' },
  5: { gates: ['5', '6'], blocks: ['Kiri', 'Tengah', 'Kanan'], note: 'area melengkung mengelilingi floor (lorong diasumsikan)' },
  6: { gates: ['6', '7'], blocks: ['Kiri', 'Tengah', 'Kanan'], note: 'tribun melengkung kiri-bawah (lorong diasumsikan)' },
  7: { gates: ['7', '8'], blocks: ['Atas Kiri', 'Bawah Kiri', 'Bawah'], note: 'pinggiran tribun, porsi blok mengikuti luas zona di denah' },
};
let ts = `/**
 * ============================================================
 *  SEAT LAYOUT CONFIG — ESTIMASI
 * ============================================================
 * Kuota tiket per CAT (capacity) diambil dari data penjualan:
 *   CAT 1: 60 · CAT 2: 356 · CAT 3: 552 · CAT 4: 746
 *   CAT 5: 596 · CAT 6: 718 · CAT 7: 212 · TOTAL 3.240
 *
 * Jumlah baris, kursi per baris, dan pembagian blok adalah ESTIMASI:
 * kuota dibagi rata ke beberapa baris (baris belakang sedikit lebih
 * panjang), lalu tiap baris dibagi ke blok sesuai bentuk zona di denah.
 * Totalnya dijamin sama dengan kuota (lihat seatLayout.test.ts).
 * Gate masih DUMMY.
 *
 * Cara baca:
 * - \`gates\`      : gate yang melayani kategori tsb.
 * - \`numbering\`  : 'ltr' = seat no. 1 ada di paling KIRI (dilihat dari
 *                  kursi menghadap panggung); 'rtl' = sebaliknya.
 * - \`blockNames\` : nama blok dari kiri ke kanan.
 * - \`rows\`       : urut dari baris PALING DEKAT panggung.
 *                  \`blocks\` = jumlah kursi tiap blok, urut sesuai
 *                  \`blockNames\`. Di antara blok ada lorong.
 *                  Penomoran bersambung lintas blok.
 * - \`capacity\`   : kuota tiket resmi CAT ini.
 * - \`verified\`   : false = masih estimasi, jadi validasi hanya PERINGATAN.
 *                  Ubah ke true kalau sudah dicek ke denah resmi.
 */

export type NumberingDirection = 'ltr' | 'rtl';

export interface RowDef {
  label: string;
  /** jumlah kursi per blok, urut sesuai blockNames */
  blocks: number[];
}

export interface CategoryLayout {
  category: number; // 1..7
  name: string;
  gates: string[];
  numbering: NumberingDirection;
  blockNames: string[];
  rows: RowDef[];
  /** kuota tiket resmi */
  capacity: number;
  verified: boolean;
}

export const SEAT_LAYOUT: CategoryLayout[] = [
`;
for (const [cat, total, n, spread, ratios] of SPEC) {
  const totals = rowTotals(total, n, spread);
  const m = META[cat];
  ts += `  {
    // ${m.note}
    category: ${cat},
    name: 'CAT ${cat}',
    gates: [${m.gates.map((g) => `'${g}'`).join(', ')}],
    numbering: 'ltr',
    blockNames: [${m.blocks.map((b) => `'${b}'`).join(', ')}],
    capacity: ${total},
    rows: [
${totals.map((t, i) => `      { label: '${L(n)[i]}', blocks: [${split(t, ratios).join(', ')}] }, // ${t}`).join('\n')}
    ],
    verified: false,
  },
`;
}
ts += `];

export const CATEGORIES = SEAT_LAYOUT.map((c) => c.category);

/** Semua gate venue (gabungan), urut numerik */
export const ALL_GATES: string[] = Array.from(new Set(SEAT_LAYOUT.flatMap((c) => c.gates))).sort((a, b) =>
  a.localeCompare(b, 'id', { numeric: true }),
);

/** Total kuota semua CAT (3.240) */
export const TOTAL_CAPACITY = SEAT_LAYOUT.reduce((a, c) => a + c.capacity, 0);
`;
writeFileSync(process.argv[2], ts);
console.log('ditulis', process.argv[2]);
