import { useCallback, useEffect, useRef, useState } from 'react';
import { friendlyError, getRowSeats, subscribeCategory } from '../lib/api';
import type { PublicSeat } from '../lib/types';

/**
 * Ambil semua entri satu row, lalu refetch otomatis (debounce 500ms)
 * kalau ada perubahan realtime di kategori itu.
 */
export function useRowSeats(category: number | null, rowLabel: string | null) {
  const [seats, setSeats] = useState<PublicSeat[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const reqId = useRef(0);

  const load = useCallback(
    async (silent: boolean) => {
      if (!category || !rowLabel) return;
      const id = ++reqId.current;
      if (!silent) setStatus('loading');
      try {
        const data = await getRowSeats(category, rowLabel);
        if (id !== reqId.current) return;
        setSeats(data);
        setStatus('ok');
      } catch (e) {
        if (id !== reqId.current) return;
        // refetch diam-diam yang gagal tidak menimpa data yang sudah tampil
        if (!silent) {
          setError(friendlyError(e));
          setStatus('error');
        }
      }
    },
    [category, rowLabel],
  );

  useEffect(() => {
    if (!category || !rowLabel) return;
    void load(false);
    let unsub = () => {};
    try {
      unsub = subscribeCategory(category, () => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => void load(true), 500);
      });
    } catch {
      /* realtime opsional */
    }
    return () => {
      clearTimeout(timer.current);
      unsub();
    };
  }, [category, rowLabel, load]);

  return { seats, status, error, reload: () => load(false) };
}
