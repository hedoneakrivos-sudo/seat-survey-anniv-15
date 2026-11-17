import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'anniv15.theme';

function systemTheme(): Theme {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function storedTheme(): Theme | null {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : null;
  } catch {
    return null;
  }
}

function apply(t: Theme, animate: boolean) {
  const root = document.documentElement;
  if (animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    root.classList.add('theme-anim');
    window.setTimeout(() => root.classList.remove('theme-anim'), 300);
  }
  root.dataset.theme = t;
  // warna bar browser di HP ikut tema
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', t === 'dark' ? '#0a1230' : '#3d8ef0'));
}

/**
 * Tema terang/gelap. Default ikut setelan perangkat; begitu user memilih,
 * pilihannya disimpan di localStorage (per perangkat).
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => storedTheme() ?? systemTheme());

  useEffect(() => {
    apply(theme, false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // selama user belum memilih sendiri, ikuti perubahan setelan perangkat
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (storedTheme()) return;
      const t = mq.matches ? 'dark' : 'light';
      setTheme(t);
      apply(t, true);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((cur) => {
      const next: Theme = cur === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* mode privat: tetap ganti, cuma tidak tersimpan */
      }
      apply(next, true);
      return next;
    });
  }, []);

  return { theme, toggle };
}
