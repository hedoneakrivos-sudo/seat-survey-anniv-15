/**
 * Penyimpanan lokal: edit_token & seat milik user, plus device key
 * untuk rate limit. Semua dibungkus try/catch (private mode dsb).
 */
const MY_SEAT_KEY = 'anniv15.mySeat';
const DEVICE_KEY = 'anniv15.device';

export interface MySeatRef {
  id: string;
  editToken: string;
}

function randomToken(bytes = 24): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function newEditToken(): string {
  return randomToken(24);
}

let memoryDevice: string | null = null;
export function deviceKey(): string {
  try {
    let k = localStorage.getItem(DEVICE_KEY);
    if (!k) {
      k = randomToken(12);
      localStorage.setItem(DEVICE_KEY, k);
    }
    return k;
  } catch {
    return (memoryDevice ??= randomToken(12));
  }
}

export function getMySeat(): MySeatRef | null {
  try {
    const raw = localStorage.getItem(MY_SEAT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return typeof v?.id === 'string' && typeof v?.editToken === 'string' ? v : null;
  } catch {
    return null;
  }
}

export function setMySeat(v: MySeatRef): void {
  try {
    localStorage.setItem(MY_SEAT_KEY, JSON.stringify(v));
  } catch {
    /* abaikan: private mode dsb */
  }
  notifyMySeat();
}

export function clearMySeat(): void {
  try {
    localStorage.removeItem(MY_SEAT_KEY);
  } catch {
    /* noop */
  }
  notifyMySeat();
}

/* ---------- langganan perubahan (untuk useSyncExternalStore) ---------- */

const listeners = new Set<() => void>();
export function subscribeMySeat(fn: () => void): () => void {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => e.key === MY_SEAT_KEY && fn();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
}
export const notifyMySeat = () => listeners.forEach((fn) => fn());

/** snapshot stabil: string mentah, di-parse di hook */
export function mySeatSnapshot(): string | null {
  try {
    return localStorage.getItem(MY_SEAT_KEY);
  } catch {
    return null;
  }
}
