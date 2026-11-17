import { useMemo, useSyncExternalStore } from 'react';
import { mySeatSnapshot, subscribeMySeat, type MySeatRef } from '../lib/storage';

export function useMySeat(): MySeatRef | null {
  const raw = useSyncExternalStore(subscribeMySeat, mySeatSnapshot, () => null);
  return useMemo(() => {
    if (!raw) return null;
    try {
      const v = JSON.parse(raw);
      return typeof v?.id === 'string' && typeof v?.editToken === 'string' ? v : null;
    } catch {
      return null;
    }
  }, [raw]);
}
