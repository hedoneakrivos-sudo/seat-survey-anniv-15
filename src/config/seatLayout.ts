/**
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
 * - `gates`      : gate yang melayani kategori tsb.
 * - `numbering`  : 'ltr' = seat no. 1 ada di paling KIRI (dilihat dari
 *                  kursi menghadap panggung); 'rtl' = sebaliknya.
 * - `blockNames` : nama blok dari kiri ke kanan.
 * - `rows`       : urut dari baris PALING DEKAT panggung.
 *                  `blocks` = jumlah kursi tiap blok, urut sesuai
 *                  `blockNames`. Di antara blok ada lorong.
 *                  Penomoran bersambung lintas blok.
 * - `capacity`   : kuota tiket resmi CAT ini.
 * - `verified`   : false = masih estimasi, jadi validasi hanya PERINGATAN.
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
  {
    // 2 potongan kecil di samping stage
    category: 1,
    name: 'CAT 1',
    gates: ['1', '2'],
    numbering: 'ltr',
    blockNames: ['Kiri', 'Kanan'],
    capacity: 60,
    rows: [
      { label: 'A', blocks: [10, 10] }, // 20
      { label: 'B', blocks: [10, 10] }, // 20
      { label: 'C', blocks: [10, 10] }, // 20
    ],
    verified: false,
  },
  {
    // 2 blok di kiri-kanan island stage
    category: 2,
    name: 'CAT 2',
    gates: ['1', '2', '3'],
    numbering: 'ltr',
    blockNames: ['Kiri Island', 'Kanan Island'],
    capacity: 356,
    rows: [
      { label: 'A', blocks: [20, 20] }, // 40
      { label: 'B', blocks: [21, 20] }, // 41
      { label: 'C', blocks: [22, 21] }, // 43
      { label: 'D', blocks: [22, 22] }, // 44
      { label: 'E', blocks: [23, 22] }, // 45
      { label: 'F', blocks: [23, 23] }, // 46
      { label: 'G', blocks: [24, 24] }, // 48
      { label: 'H', blocks: [25, 24] }, // 49
    ],
    verified: false,
  },
  {
    // floor depan + potongan atas + potongan kanan bawah
    category: 3,
    name: 'CAT 3',
    gates: ['2', '3', '4'],
    numbering: 'ltr',
    blockNames: ['Atas', 'Tengah', 'Kanan Bawah'],
    capacity: 552,
    rows: [
      { label: 'A', blocks: [12, 19, 9] }, // 40
      { label: 'B', blocks: [12, 20, 9] }, // 41
      { label: 'C', blocks: [13, 20, 9] }, // 42
      { label: 'D', blocks: [13, 21, 9] }, // 43
      { label: 'E', blocks: [13, 21, 10] }, // 44
      { label: 'F', blocks: [13, 22, 10] }, // 45
      { label: 'G', blocks: [14, 23, 10] }, // 47
      { label: 'H', blocks: [14, 23, 11] }, // 48
      { label: 'I', blocks: [15, 23, 11] }, // 49
      { label: 'J', blocks: [15, 24, 11] }, // 50
      { label: 'K', blocks: [15, 25, 11] }, // 51
      { label: 'L', blocks: [16, 25, 11] }, // 52
    ],
    verified: false,
  },
  {
    // tribun melengkung atas & kanan bawah
    category: 4,
    name: 'CAT 4',
    gates: ['4', '5'],
    numbering: 'ltr',
    blockNames: ['Atas', 'Kanan Bawah'],
    capacity: 746,
    rows: [
      { label: 'A', blocks: [34, 34] }, // 68
      { label: 'B', blocks: [35, 35] }, // 70
      { label: 'C', blocks: [36, 35] }, // 71
      { label: 'D', blocks: [36, 36] }, // 72
      { label: 'E', blocks: [37, 37] }, // 74
      { label: 'F', blocks: [38, 37] }, // 75
      { label: 'G', blocks: [39, 38] }, // 77
      { label: 'H', blocks: [39, 39] }, // 78
      { label: 'I', blocks: [40, 40] }, // 80
      { label: 'J', blocks: [41, 40] }, // 81
    ],
    verified: false,
  },
  {
    // area melengkung mengelilingi floor (lorong diasumsikan)
    category: 5,
    name: 'CAT 5',
    gates: ['5', '6'],
    numbering: 'ltr',
    blockNames: ['Kiri', 'Tengah', 'Kanan'],
    capacity: 596,
    rows: [
      { label: 'A', blocks: [20, 27, 20] }, // 67
      { label: 'B', blocks: [21, 27, 21] }, // 69
      { label: 'C', blocks: [21, 29, 21] }, // 71
      { label: 'D', blocks: [22, 29, 22] }, // 73
      { label: 'E', blocks: [23, 30, 23] }, // 76
      { label: 'F', blocks: [24, 31, 23] }, // 78
      { label: 'G', blocks: [24, 32, 24] }, // 80
      { label: 'H', blocks: [25, 33, 24] }, // 82
    ],
    verified: false,
  },
  {
    // tribun melengkung kiri-bawah (lorong diasumsikan)
    category: 6,
    name: 'CAT 6',
    gates: ['6', '7'],
    numbering: 'ltr',
    blockNames: ['Kiri', 'Tengah', 'Kanan'],
    capacity: 718,
    rows: [
      { label: 'A', blocks: [15, 15, 14] }, // 44
      { label: 'B', blocks: [15, 15, 15] }, // 45
      { label: 'C', blocks: [16, 15, 15] }, // 46
      { label: 'D', blocks: [16, 16, 15] }, // 47
      { label: 'E', blocks: [16, 16, 16] }, // 48
      { label: 'F', blocks: [17, 16, 16] }, // 49
      { label: 'G', blocks: [17, 17, 17] }, // 51
      { label: 'H', blocks: [18, 17, 17] }, // 52
      { label: 'I', blocks: [18, 18, 17] }, // 53
      { label: 'J', blocks: [18, 18, 18] }, // 54
      { label: 'K', blocks: [19, 18, 18] }, // 55
      { label: 'L', blocks: [19, 19, 19] }, // 57
      { label: 'M', blocks: [20, 19, 19] }, // 58
      { label: 'N', blocks: [20, 20, 19] }, // 59
    ],
    verified: false,
  },
  {
    // pinggiran tribun, porsi blok mengikuti luas zona di denah
    category: 7,
    name: 'CAT 7',
    gates: ['7', '8'],
    numbering: 'ltr',
    blockNames: ['Atas Kiri', 'Bawah Kiri', 'Bawah'],
    capacity: 212,
    rows: [
      { label: 'A', blocks: [12, 15, 26] }, // 53
      { label: 'B', blocks: [12, 15, 26] }, // 53
      { label: 'C', blocks: [12, 15, 26] }, // 53
      { label: 'D', blocks: [12, 15, 26] }, // 53
    ],
    verified: false,
  },
];

export const CATEGORIES = SEAT_LAYOUT.map((c) => c.category);

/** Semua gate venue (gabungan), urut numerik */
export const ALL_GATES: string[] = Array.from(new Set(SEAT_LAYOUT.flatMap((c) => c.gates))).sort((a, b) =>
  a.localeCompare(b, 'id', { numeric: true }),
);

/** Total kuota semua CAT (3.240) */
export const TOTAL_CAPACITY = SEAT_LAYOUT.reduce((a, c) => a + c.capacity, 0);
