import { useEffect, useState } from 'react';
import { useDebounce } from './useDebounce';
import { findSeatOwner } from '../lib/api';
import { GATE_RE, ROW_RE, normCode } from '../lib/validation';
import type { PublicSeat } from '../lib/types';
import { supabaseConfigured } from '../lib/supabase';

export interface SeatKey {
  category: number | null;
  gate: string;
  row_label: string;
  seat_number: string;
}

export const seatKeyString = (k: SeatKey) =>
  `${k.category}|${normCode(k.gate)}|${normCode(k.row_label)}|${Number(k.seat_number)}`;

function isComplete(k: SeatKey): boolean {
  const n = Number(k.seat_number);
  return (
    !!k.category &&
    GATE_RE.test(normCode(k.gate)) &&
    ROW_RE.test(normCode(k.row_label)) &&
    Number.isInteger(n) &&
    n >= 1
  );
}

/**
 * Begitu 4 field seat lengkap, cek ke DB (debounce 400ms).
 * `owner` = entri yang sudah ada di seat itu (atau null).
 */
export function useDuplicateCheck(key: SeatKey, excludeId?: string) {
  const debounced = useDebounce(key, 400);
  const keyStr = seatKeyString(debounced);
  const [state, setState] = useState<{ key: string; owner: PublicSeat | null; checking: boolean }>({
    key: '',
    owner: null,
    checking: false,
  });

  useEffect(() => {
    if (!supabaseConfigured || !isComplete(debounced)) {
      setState({ key: '', owner: null, checking: false });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, checking: true }));
    findSeatOwner(
      debounced.category!,
      debounced.gate,
      debounced.row_label,
      Number(debounced.seat_number),
      excludeId,
    )
      .then((owner) => !cancelled && setState({ key: keyStr, owner, checking: false }))
      // gagal cek bukan alasan blokir; server tetap jaga lewat unique index
      .catch(() => !cancelled && setState({ key: keyStr, owner: null, checking: false }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyStr, excludeId]);

  // pastikan hasil cocok dengan key saat ini (bukan key lama)
  const current = seatKeyString(key) === state.key;
  return { owner: current ? state.owner : null, checking: state.checking, checkedKey: state.key };
}
