/**
 * ============================================================
 *  INFO EVENT & KATEGORI: "AYO SENYUMLAH"
 * ============================================================
 * Harga & benefit disalin dari poster resmi. Warna diambil langsung
 * dari piksel kotak legenda di public/assets/seatmap.jpg.
 *
 * Fan project tidak resmi. Kalau info di poster berubah, edit di sini.
 */

export const EVENT = {
  title: 'Ayo Senyumlah',
  subtitle: 'JKT48 15th Anniversary Concert',
  venue: 'Graha Unesa, Surabaya',
  /** tanggal acara, zona waktu venue (WIB) */
  date: '2026-12-19',
  dateLabel: '19 Des 2026',
  timeZone: 'Asia/Jakarta',
} as const;

export interface Price {
  amount: number;
  label: 'Pre-Sale' | 'General' | 'Pre-Sale Only' | 'General Only';
}

export interface CatInfo {
  category: number;
  name: string;
  /** warna persis dari legenda poster */
  color: string;
  /**
   * Warna teks di atas `color`, dipilih dari kontras WCAG (≥ 4.5:1),
   * bukan dari tebakan. Lihat catConfig.test.ts.
   */
  textColor: string;
  prices: Price[];
  benefits: string[];
}

// cokelat sangat tua: #2a1a00 hanya 4.39:1 di atas merah CAT 1
const INK = '#1a0d00';
const WHITE = '#ffffff';

export const CAT_CONFIG: CatInfo[] = [
  {
    category: 1,
    name: 'CAT 1',
    color: '#ff1e26',
    textColor: INK, // putih cuma 3.84:1
    prices: [{ amount: 3_500_000, label: 'Pre-Sale Only' }],
    benefits: [
      'Pre-Show Soundcheck Experience',
      'After Show Group Photoshoot with JKT48',
      'JKT48 Light Stick 2.0',
      'Exclusive T-Shirt',
      'Special Merchandise Kit',
      'Fast-Track Lane at JKT48 Official Merchandise Booth',
    ],
  },
  {
    category: 2,
    name: 'CAT 2',
    color: '#ffff01',
    textColor: INK,
    prices: [
      { amount: 2_000_000, label: 'Pre-Sale' },
      { amount: 2_200_000, label: 'General' },
    ],
    benefits: [
      'After Show Group Photoshoot with JKT48',
      'JKT48 Light Stick 2.0',
      'Exclusive T-Shirt',
      'Special Merchandise Kit',
    ],
  },
  {
    category: 3,
    name: 'CAT 3',
    color: '#932fea',
    textColor: WHITE,
    prices: [
      { amount: 1_100_000, label: 'Pre-Sale' },
      { amount: 1_200_000, label: 'General' },
    ],
    benefits: ['JKT48 Light Stick 2.0'],
  },
  {
    category: 4,
    name: 'CAT 4',
    color: '#f15a25',
    textColor: INK,
    prices: [
      { amount: 900_000, label: 'Pre-Sale' },
      { amount: 1_000_000, label: 'General' },
    ],
    benefits: [],
  },
  {
    category: 5,
    name: 'CAT 5',
    color: '#57bc3c',
    textColor: INK,
    prices: [
      { amount: 700_000, label: 'Pre-Sale' },
      { amount: 750_000, label: 'General' },
    ],
    benefits: [],
  },
  {
    category: 6,
    name: 'CAT 6',
    color: '#3b8bea',
    textColor: INK, // putih cuma 3.46:1
    prices: [
      { amount: 500_000, label: 'Pre-Sale' },
      { amount: 550_000, label: 'General' },
    ],
    benefits: [],
  },
  {
    category: 7,
    name: 'CAT 7',
    color: '#ff56af',
    textColor: INK,
    prices: [{ amount: 450_000, label: 'General Only' }],
    benefits: [],
  },
];

export function getCatInfo(category: number | null | undefined): CatInfo | undefined {
  return CAT_CONFIG.find((c) => c.category === category);
}

const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

/** "Rp3.500.000" (tanpa spasi, seperti poster) */
export const formatRupiah = (n: number) => rupiah.format(n).replace(/\s/g, '');

/** "Rp1.100.000 (Pre-Sale) | Rp1.200.000 (General)" */
export const formatPrices = (c: CatInfo) =>
  c.prices.map((p) => `${formatRupiah(p.amount)} (${p.label})`).join(' | ');

/** Harga pertama, buat tooltip ringkas: "Rp1.100.000 (Pre-Sale)" */
export const formatFirstPrice = (c: CatInfo) => `${formatRupiah(c.prices[0].amount)} (${c.prices[0].label})`;
