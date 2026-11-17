import { describe, expect, it } from 'vitest';
import { groupBySeat, seatState } from './seatState';
import type { PublicSeat } from './types';

const s = (n: number, o: Partial<PublicSeat> = {}): PublicSeat => ({
  id: `id-${n}-${Math.random()}`,
  category: 3,
  gate: '3',
  row_label: 'C',
  seat_number: n,
  nickname: 'X',
  sex: 'F',
  want_swap: false,
  x_username: null,
  ig_username: null,
  is_duplicate: false,
  created_at: '',
  ...o,
});

describe('seatState', () => {
  it('kosong', () => expect(seatState(undefined, false)).toBe('empty'));
  it('terisi', () => expect(seatState([s(1)], false)).toBe('taken'));
  it('mau tukar', () => expect(seatState([s(1, { want_swap: true })], false)).toBe('swap'));
  it('dua entri di seat sama = duplikat, walau tidak ditandai', () =>
    expect(seatState([s(1), s(1)], false)).toBe('dup'));
  it('ditandai duplikat menang atas mau tukar', () =>
    expect(seatState([s(1, { want_swap: true, is_duplicate: true })], false)).toBe('dup'));
  it('seat user selalu menang', () => expect(seatState([s(1), s(1)], true)).toBe('mine'));
});

describe('groupBySeat', () => {
  it('kelompokkan per nomor', () => {
    const m = groupBySeat([s(1), s(2), s(1)]);
    expect(m.get(1)?.length).toBe(2);
    expect(m.get(2)?.length).toBe(1);
    expect(m.get(3)).toBeUndefined();
  });
});
