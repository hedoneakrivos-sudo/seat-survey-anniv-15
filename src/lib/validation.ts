import { blockIndexOf, formatGateList, getCategory, getRow, seatCount } from './layout';

export const NICK_MIN = 2;
export const NICK_MAX = 30;

export type Sex = 'M' | 'F';

export interface SeatFormValues {
  category: number | null;
  gate: string;
  row_label: string;
  seat_number: string; // string dari input, di-parse saat validasi
  nickname: string;
  sex: Sex | '';
  want_swap: boolean;
  x_username: string;
  ig_username: string;
  /** honeypot — harus kosong */
  website: string;
}

export const emptyForm = (): SeatFormValues => ({
  category: null,
  gate: '',
  row_label: '',
  seat_number: '',
  nickname: '',
  sex: '',
  want_swap: false,
  x_username: '',
  ig_username: '',
  website: '',
});

export type FieldKey = keyof SeatFormValues;
export type Errors = Partial<Record<FieldKey, string>>;

/* ---------------------- normalisasi ---------------------- */

export const normCode = (v: string) => v.trim().toUpperCase().replace(/\s+/g, '');

/** Buang @ di depan, spasi, dan karakter tak terlihat */
export const normHandle = (v: string) => v.trim().replace(/^@+/, '').replace(/\s+/g, '');

/** Rapikan nickname: trim, satukan spasi, buang karakter kontrol & tag HTML */
export function normNickname(v: string): string {
  return v
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u206F]/g, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---------------------- aturan pola ---------------------- */

// Sama persis dengan constraint di DB (lihat migration)
export const GATE_RE = /^[A-Z0-9-]{1,10}$/;
export const ROW_RE = /^([A-Z]{1,3}|[0-9]{1,3})$/;
export const X_RE = /^[A-Za-z0-9_]{1,15}$/;
export const IG_RE = /^(?!.*\.\.)(?!\.)(?!.*\.$)[A-Za-z0-9._]{1,30}$/;

/* ---------------------- kata kasar (sederhana) ---------------------- */

// Daftar pendek, cukup untuk saring iseng. Sinkron dengan fungsi DB `is_profane`.
export const BAD_WORDS = [
  'anjing', 'anjg', 'bangsat', 'bajingan', 'kontol', 'memek', 'ngentot', 'ngewe',
  'jancok', 'jancuk', 'goblok', 'tolol', 'pepek', 'lonte',
  'fuck', 'bitch', 'asshole', 'pussy',
];

export function isProfane(v: string): boolean {
  const s = v
    .toLowerCase()
    .replace(/[0@]/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/[^a-z]/g, '');
  return BAD_WORDS.some((w) => s.includes(w));
}

/* ---------------------- validasi ---------------------- */

export interface LayoutCheck {
  errors: Errors; // memblokir submit
  warnings: Errors; // peringatan lunak (config belum verified)
}

/**
 * Cek gate/row/nomor seat terhadap seatLayout.
 * Kalau kategori `verified: false`, semua masalah layout jadi warning.
 */
export function checkAgainstLayout(v: SeatFormValues): LayoutCheck {
  const out: LayoutCheck = { errors: {}, warnings: {} };
  const layout = getCategory(v.category);
  if (!layout) return out;
  const bucket = layout.verified ? out.errors : out.warnings;
  const cat = layout.name;

  const gate = normCode(v.gate);
  if (gate && GATE_RE.test(gate) && !layout.gates.includes(gate)) {
    bucket.gate = `Gate ${gate} tidak melayani ${cat}, pilih ${formatGateList(layout.gates)}`;
  }

  const rowLabel = normCode(v.row_label);
  const row = getRow(layout, rowLabel);
  if (rowLabel && ROW_RE.test(rowLabel) && !row) {
    const labels = layout.rows.map((r) => r.label);
    bucket.row_label = `Row ${rowLabel} nggak ada di ${cat} (${labels[0]}–${labels[labels.length - 1]})`;
  }

  const n = Number(v.seat_number);
  if (row && Number.isInteger(n) && n >= 1) {
    const max = seatCount(row);
    if (n > max) {
      bucket.seat_number = `Row ${rowLabel} di ${cat} hanya punya ${max} seat`;
    } else if (blockIndexOf(row, n, layout.numbering) < 0) {
      bucket.seat_number = `Seat ${n} nggak ditemukan di Row ${rowLabel}`;
    }
  }
  return out;
}

/** Validasi field per langkah wizard */
export const STEP_FIELDS: FieldKey[][] = [
  ['category', 'gate', 'row_label', 'seat_number'],
  ['nickname', 'sex'],
  ['want_swap', 'x_username', 'ig_username'],
];

export function validate(v: SeatFormValues): LayoutCheck {
  const errors: Errors = {};

  if (!v.category || v.category < 1 || v.category > 7) errors.category = 'Pilih kategori dulu ya';

  const gate = normCode(v.gate);
  if (!gate) errors.gate = 'Gate wajib diisi';
  else if (!GATE_RE.test(gate)) errors.gate = 'Gate cuma boleh huruf/angka';

  const row = normCode(v.row_label);
  if (!row) errors.row_label = 'Row wajib diisi';
  else if (!ROW_RE.test(row)) errors.row_label = 'Row berupa huruf (C, AA) atau angka (12)';

  const seatStr = v.seat_number.trim();
  const n = Number(seatStr);
  if (!seatStr) errors.seat_number = 'No. seat wajib diisi';
  else if (!/^\d+$/.test(seatStr) || !Number.isInteger(n) || n < 1) errors.seat_number = 'No. seat minimal 1';
  else if (n > 9999) errors.seat_number = 'No. seat kebesaran';

  const nick = normNickname(v.nickname);
  if (!nick) errors.nickname = 'Nickname wajib diisi';
  else if ([...nick].length < NICK_MIN) errors.nickname = `Minimal ${NICK_MIN} karakter`;
  else if ([...nick].length > NICK_MAX) errors.nickname = `Maksimal ${NICK_MAX} karakter`;
  else if (isProfane(nick)) errors.nickname = 'Nickname-nya dijaga ya, ganti yang lain 🙏';

  if (v.sex !== 'M' && v.sex !== 'F') errors.sex = 'Pilih salah satu';

  const x = normHandle(v.x_username);
  if (x && !X_RE.test(x)) errors.x_username = 'Username X: huruf, angka, _ (maks 15)';
  else if (x && isProfane(x)) errors.x_username = 'Username ini nggak bisa dipakai';

  const ig = normHandle(v.ig_username);
  if (ig && !IG_RE.test(ig)) errors.ig_username = 'Username IG: huruf, angka, titik, _ (maks 30)';
  else if (ig && isProfane(ig)) errors.ig_username = 'Username ini nggak bisa dipakai';

  const layout = checkAgainstLayout(v);
  return { errors: { ...layout.errors, ...errors }, warnings: layout.warnings };
}

export function errorsForStep(errors: Errors, step: number): Errors {
  const keys = STEP_FIELDS[step];
  return Object.fromEntries(Object.entries(errors).filter(([k]) => keys.includes(k as FieldKey)));
}

/** Payload bersih yang dikirim ke RPC */
export function toPayload(v: SeatFormValues) {
  return {
    p_category: v.category as number,
    p_gate: normCode(v.gate),
    p_row_label: normCode(v.row_label),
    p_seat_number: Number(v.seat_number),
    p_nickname: normNickname(v.nickname),
    p_sex: v.sex as Sex,
    p_want_swap: v.want_swap,
    p_x_username: normHandle(v.x_username) || null,
    p_ig_username: normHandle(v.ig_username) || null,
    p_honeypot: v.website,
  };
}
