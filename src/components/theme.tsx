import type { ReactNode, ButtonHTMLAttributes } from 'react';
import { getCatInfo } from '../config/catConfig';
import { cx } from '../lib/cx';

/* ---------------- GlassCard (surface L1) ---------------- */

export function GlassCard({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'aside' | 'li';
}) {
  return <Tag className={cx('glass rounded-2xl p-4 sm:p-5', className)}>{children}</Tag>;
}

/* ---------------- GoldButton (CTA utama) ---------------- */

/** Tombol utama: isi solid satu warna aksen, tanpa bayangan 3D. */
export function GoldButton({
  children,
  className,
  loading,
  size = 'md',
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; size?: 'md' | 'lg' }) {
  return (
    <button
      type="button"
      {...p}
      disabled={p.disabled || loading}
      className={cx(
        'focus-ring relative inline-flex items-center justify-center gap-2 rounded-full font-display font-semibold tracking-wide',
        'bg-gold-400 text-gold-ink shadow-[0_6px_16px_-6px_rgb(232_168_0_/_0.7)] transition-[background-color,transform] duration-150 hover:bg-gold-300 active:scale-[0.98]',
        'disabled:cursor-not-allowed disabled:opacity-60',
        size === 'lg' ? 'min-h-12 px-6 text-base' : 'min-h-11 px-5 text-sm',
        className,
      )}
    >
      {loading ? <SmileLoader className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

/* ---------------- CatChip ---------------- */

interface CatChipProps {
  category: number;
  selected?: boolean;
  count?: number;
  onClick?: () => void;
  className?: string;
  /** chip sebagai tombol (default) atau label statis */
  as?: 'button' | 'span';
}

/** Chip netral dengan titik warna CAT. Warna penuh hanya di titiknya. */
export function CatChip({ category, selected, count, onClick, className, as = 'button' }: CatChipProps) {
  const info = getCatInfo(category);
  if (!info) return null;
  const inner = (
    <>
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: info.color }} aria-hidden />
      <span className="text-sm font-medium leading-none">CAT {category}</span>
      {typeof count === 'number' && <span className="text-xs tabular-nums text-ink-soft">{count}</span>}
    </>
  );
  const base = cx(
    'inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-ink transition-colors',
    selected ? 'border-gold-400 bg-gold-400/20' : 'border-[var(--chip-border)] bg-[var(--chip)] hover:bg-[var(--surface-2)]',
    className,
  );
  if (as === 'span') return <span className={base}>{inner}</span>;
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className={cx(base, 'focus-ring')}>
      {inner}
    </button>
  );
}

/* ---------------- loader & state ---------------- */

/** Maskot smiley: spin = loader berputar, spin={false} = ikon statis */
export function SmileLoader({ className, spin = true }: { className?: string; spin?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={cx(spin && 'animate-spin', className)} aria-hidden>
      <circle cx="16" cy="16" r="15" fill="#ffc933" />
      <circle cx="16" cy="16" r="15" fill="none" stroke="#e8a800" strokeWidth="1.5" />
      <circle cx="11.5" cy="13.5" r="1.8" fill="#3d2a00" />
      <circle cx="20.5" cy="13.5" r="1.8" fill="#3d2a00" />
      <path d="M10 19.5q6 5.5 12 0" fill="none" stroke="#3d2a00" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function SmileState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center" role="status" aria-live="polite">
      <SmileLoader className="mb-1 h-10 w-10" spin={false} />
      <p className="font-display text-lg font-semibold text-ink">{title}</p>
      {children && <div className="max-w-sm text-sm text-ink-soft">{children}</div>}
    </div>
  );
}

export function SmileSpinner({ title = 'Sabar ya, lagi senyum…' }: { title?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-ink-soft" role="status" aria-live="polite">
      <SmileLoader className="h-9 w-9" />
      <p className="text-sm">{title}</p>
    </div>
  );
}
