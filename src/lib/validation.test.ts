import { describe, expect, it } from 'vitest';
import { emptyForm, validate, isProfane, normNickname, toPayload, type SeatFormValues } from './validation';
import { SEAT_LAYOUT, TOTAL_CAPACITY } from '../config/seatLayout';
import { seatCount, getRow, getCategory } from './layout';

const base = (o: Partial<SeatFormValues> = {}): SeatFormValues => ({
  ...emptyForm(),
  category: 3,
  gate: '3',
  row_label: 'C',
  seat_number: '5',
  nickname: 'Rina',
  sex: 'F',
  ...o,
});

describe('validate', () => {
  it('lolos untuk data valid', () => {
    const r = validate(base());
    expect(r.errors).toEqual({});
    expect(r.warnings).toEqual({});
  });

  it('wajibkan semua field inti', () => {
    const r = validate(emptyForm());
    expect(Object.keys(r.errors).sort()).toEqual(
      ['category', 'gate', 'nickname', 'row_label', 'seat_number', 'sex'].sort(),
    );
  });

  it('pesan spesifik untuk seat yang melebihi row (soft warning karena estimasi)', () => {
    const max = seatCount(getRow(getCategory(3), 'C')!);
    const r = validate(base({ seat_number: String(max + 1) }));
    expect(r.errors.seat_number).toBeUndefined();
    expect(r.warnings.seat_number).toBe(`Row C di CAT 3 hanya punya ${max} seat`);
  });

  it('pesan spesifik untuk gate yang salah', () => {
    const r = validate(base({ gate: '5' }));
    expect(r.warnings.gate).toBe('Gate 5 tidak melayani CAT 3, pilih Gate 2/3/4');
  });

  it('layout verified → jadi error yang memblokir', () => {
    const cat = getCategory(3)!;
    cat.verified = true;
    try {
      const max = seatCount(getRow(cat, 'C')!);
      expect(validate(base({ seat_number: String(max + 1) })).errors.seat_number).toMatch(`hanya punya ${max}`);
    } finally {
      cat.verified = false;
    }
  });

  it('normalisasi row & gate', () => {
    const p = toPayload(base({ row_label: ' aa ', gate: ' 3 ', x_username: '@budi_01' }));
    expect(p.p_row_label).toBe('AA');
    expect(p.p_gate).toBe('3');
    expect(p.p_x_username).toBe('budi_01');
  });

  it('nickname 2-30 karakter', () => {
    expect(validate(base({ nickname: 'A' })).errors.nickname).toBeTruthy();
    expect(validate(base({ nickname: 'x'.repeat(31) })).errors.nickname).toBeTruthy();
  });

  it('seat_number harus integer >= 1', () => {
    expect(validate(base({ seat_number: '0' })).errors.seat_number).toBeTruthy();
    expect(validate(base({ seat_number: '1.5' })).errors.seat_number).toBeTruthy();
  });

  it('validasi karakter sosmed', () => {
    expect(validate(base({ x_username: 'ab-cd' })).errors.x_username).toBeTruthy();
    expect(validate(base({ ig_username: 'a..b' })).errors.ig_username).toBeTruthy();
    expect(validate(base({ ig_username: 'nama.ok_1' })).errors.ig_username).toBeUndefined();
  });
});

describe('sanitasi', () => {
  it('buang tag & karakter kontrol', () => {
    expect(normNickname('  <b>Rina</b>​  ')).toBe('bRina/b');
  });
  it('filter kata kasar sederhana', () => {
    expect(isProfane('b4ngs4t')).toBe(true);
    expect(isProfane('Kasumi')).toBe(false);
  });
});

describe('seatLayout config', () => {
  it('7 kategori, semua punya gate & row unik', () => {
    expect(SEAT_LAYOUT.map((c) => c.category)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const c of SEAT_LAYOUT) {
      expect(c.gates.length).toBeGreaterThan(0);
      const labels = c.rows.map((r) => r.label);
      expect(new Set(labels).size).toBe(labels.length);
      for (const r of c.rows) expect(r.blocks.length).toBe(c.blockNames.length);
    }
  });
  it('jumlah kursi tiap CAT = kuota tiket resmi', () => {
    const want = { 1: 60, 2: 356, 3: 552, 4: 746, 5: 596, 6: 718, 7: 212 } as Record<number, number>;
    for (const c of SEAT_LAYOUT) {
      const seats = c.rows.reduce((a, r) => a + seatCount(r), 0);
      expect({ cat: c.category, seats, capacity: c.capacity }).toEqual({
        cat: c.category,
        seats: want[c.category],
        capacity: want[c.category],
      });
    }
  });

  it('total kuota 3.240 tiket', () => {
    expect(TOTAL_CAPACITY).toBe(3240);
  });
});
