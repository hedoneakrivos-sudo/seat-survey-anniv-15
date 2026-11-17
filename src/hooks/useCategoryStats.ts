import { useCallback, useEffect, useRef, useState } from 'react';
import { getCategoryStats, subscribeAll } from '../lib/api';
import { supabaseConfigured } from '../lib/supabase';
import type { CatStats } from '../components/SeatmapInteractive';

/** Statistik per CAT, refetch (debounce 800ms) saat ada perubahan realtime */
export function useCategoryStats() {
  const [stats, setStats] = useState<Record<number, CatStats>>({});
  const [status, setStatus] = useState<'loading' | 'ok' | 'error' | 'off'>(supabaseConfigured ? 'loading' : 'off');
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(async () => {
    try {
      setStats(await getCategoryStats());
      setStatus('ok');
    } catch {
      setStatus((s) => (s === 'ok' ? s : 'error'));
    }
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) return;
    void load();
    let unsub = () => {};
    try {
      unsub = subscribeAll(() => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => void load(), 800);
      });
    } catch {
      /* realtime opsional */
    }
    return () => {
      clearTimeout(timer.current);
      unsub();
    };
  }, [load]);

  return { stats, status, reload: load };
}
