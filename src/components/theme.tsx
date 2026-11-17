import type { ReactNode, ButtonHTMLAttributes } from 'react';
import { getCatInfo } from '../config/catConfig';
import { cx } from '../lib/cx';

/* ---------------- GlassCard ---------------- */

export function GlassCard({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'aside' | 'li';
}) {
  return <Tag className={cx('glass rounded-4xl p-4 sm:p-5', className)}>{children}</Tag>;
}

/* ---------------- GoldButton ---------------- */

/**
 * Tombol emas 3D: bayangan bawah tebal yang "tertekan" saat diklik.
 * Translate + shadow ditukar bersamaan supaya tombol tidak bergeser.
 */
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
        'focus-ring relative inline-flex items-center justify-center gap-2 rounded-full font-display tracking-wide',
        'bg-gold-400 text-gold-ink shadow-3d transition-[transform,box-shadow] duration-150',
        'hover:bg-gold-300 active:translate-y-[4px] active:shadow-3d-pressed',
        'disabled:cursor-not-allowed disabled:opacity-60 disabled:active:translate-y-0 disabled:active:shadow-3d',
        size === 'lg' ? 'min-h-14 px-7 text-lg' : 'min-h-12 px-5 text-base',
        className,
      )}
    >
      {loading ? <SmileLoader className="h-5 w-5" /> : null}
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

export function CatChip({ category, selected, count, onClick, className, as = 'button' }: CatChipProps) {
  const info = getCatInfo(category);
  if (!info) return null;
  const style = { background: info.color, color: info.textColor };
  const inner = (
    <>
      <span className="font-display text-sm leading-none">CAT {category}</span>
      {typeof count === 'number' && (
        <span
          className="rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none"
          style={{ background: 'rgb(255 255 255 / .55)', color: info.textColor }}
        >
          {count}
        </span>
      )}
    </>
  );
  const base = cx(
    'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 shadow-sm transition',
    'ring-2 ring-white/70',
    selected ? 'outline-3 outline-offset-2 outline-gold-ink dark:outline-gold-400' : 'hover:brightness-105',
    className,
  );
  if (as === 'span')
    return (
      <span className={base} style={style}>
        {inner}
      </span>
    );
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(base, 'focus-ring')}
      style={style}
    >
      {inner}
    </button>
  );
}

/* ---------------- SmileLoader ---------------- */

/** Maskot smiley: loader (berputar) atau ikon statis */
export function SmileLoader({ className, spin = true }: { className?: string; spin?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={cx(spin && 'animate-spin', className)} aria-hidden>
      <circle cx="16" cy="16" r="14" fill="#ffc928" stroke="#5a3a00" strokeWidth="2.5" />
      <circle cx="11.5" cy="13" r="1.9" fill="#5a3a00" />
      <circle cx="20.5" cy="13" r="1.9" fill="#5a3a00" />
      <path d="M9.5 19q6.5 6.5 13 0" fill="none" stroke="#5a3a00" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function SmileState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center" role="status" aria-live="polite">
      <SmileLoader className="h-14 w-14" spin={false} />
      <p className="font-display text-lg text-ink">{title}</p>
      {children && <div className="max-w-sm text-sm text-ink-soft">{children}</div>}
    </div>
  );
}

export function SmileSpinner({ title = 'Sabar ya, lagi senyum…' }: { title?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16" role="status" aria-live="polite">
      <SmileLoader className="h-12 w-12" />
      <p className="font-display text-ink">{title}</p>
    </div>
  );
}
