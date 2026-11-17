import { useEffect, useRef, useState } from 'react';

/**
 * Angka yang bergulir ke nilai baru (±600ms).
 * Hormati prefers-reduced-motion: langsung ganti tanpa animasi.
 */
export function useCountUp(value: number, ms = 600): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef<number>();

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || from.current === value) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(a + (value - a) * e));
      if (t < 1) raf.current = requestAnimationFrame(step);
      else from.current = value;
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      from.current = value;
    };
  }, [value, ms]);

  return shown;
}
