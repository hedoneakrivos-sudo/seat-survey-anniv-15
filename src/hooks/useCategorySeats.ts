import { useEffect, useRef, useState } from 'react';
import { getCategorySeats, subscribeCategory } from '../lib/api';
import { supabaseConfigured } from '../lib/supabase';
import type { PublicSeat } from '../lib/types';

/** Semua entri satu CAT, refetch (debounce 600ms) saat ada perubahan realtime */
export function useCategorySeats(category: number | null) {
  const [seats, setSeats] = useState<PublicSeat[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const req = useRef(0);

  useEffect(() => {
    if (!category || !supabaseConfigured) {
      setSeats([]);
      setStatus('idle');
      return;
    }
    const load = async (silent: boolean) => {
      const id = ++req.current;
      if (!silent) setStatus('loading');
      try {
        const data = await getCategorySeats(category);
        if (id !== req.current) return;
        setSeats(data);
        setStatus('ok');
      } catch {
        if (id === req.current && !silent) setStatus('error');
      }
    };
    void load(false);
    let unsub = () => {};
    try {
      unsub = subscribeCategory(category, () => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => void load(true), 600);
      });
    } catch {
      /* realtime opsional */
    }
    return () => {
      clearTimeout(timer.current);
      unsub();
    };
  }, [category]);

  return { seats, status };
}
