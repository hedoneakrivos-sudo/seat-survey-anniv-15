import {
  forwardRef,
  type ReactNode,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type ButtonHTMLAttributes,
} from 'react';
import { SmileLoader } from './theme';

import { cx } from '../lib/cx';
export { cx };

const fieldBase =
  'block w-full rounded-2xl border-2 bg-white/90 px-3 py-3 text-base font-semibold text-slate-900 shadow-sm transition ' +
  'placeholder:font-normal placeholder:text-slate-500 focus:border-gold-500 focus:outline-none focus:ring-4 focus:ring-gold-400/40 ' +
  'dark:bg-slate-950/60 dark:text-slate-100 dark:placeholder:text-slate-400 disabled:opacity-60';

export const fieldClass = (error?: string, warning?: string) =>
  cx(
    fieldBase,
    error
      ? 'border-red-500 dark:border-red-500'
      : warning
        ? 'border-amber-500 dark:border-amber-500'
        : 'border-white dark:border-white/15',
  );

interface FieldProps {
  id: string;
  label: ReactNode;
  required?: boolean;
  error?: string;
  warning?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Label + pesan error/warning. id pesan dipakai untuk aria-describedby */
export function Field({ id, label, required, error, warning, hint, children, className }: FieldProps) {
  return (
    <div className={cx('min-w-0', className)}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-extrabold text-ink">
        {label}
        {required && (
          <span className="text-red-600 dark:text-red-400" aria-hidden>
            {' '}*
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p id={`${id}-msg`} role="alert" className="mt-1.5 text-sm font-bold text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : warning ? (
        <p id={`${id}-msg`} className="mt-1.5 text-sm font-bold text-amber-800 dark:text-amber-300">
          ⚠️ {warning}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="mt-1.5 text-sm text-ink-soft">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const describedBy = (id: string, has: boolean) => (has ? `${id}-msg` : undefined);

type WithMsg = { error?: string; warning?: string };

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & WithMsg>(
  function Input({ error, warning, className, ...p }, ref) {
    return (
      <input
        ref={ref}
        {...p}
        aria-invalid={!!error || undefined}
        className={cx(fieldClass(error, warning), className)}
      />
    );
  },
);

const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%2364748b'%3E%3Cpath d='M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4z'/%3E%3C/svg%3E\")";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & WithMsg>(
  function Select({ error, warning, className, children, ...p }, ref) {
    return (
      <select
        ref={ref}
        {...p}
        aria-invalid={!!error || undefined}
        className={cx(fieldClass(error, warning), 'appearance-none bg-no-repeat pr-8', className)}
        style={{ backgroundImage: CHEVRON, backgroundSize: '16px', backgroundPosition: 'right 0.6rem center' }}
      >
        {children}
      </select>
    );
  },
);

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
// primary = tombol emas 3D (sama dengan GoldButton)
const variants: Record<Variant, string> = {
  primary:
    'font-display tracking-wide bg-gold-400 text-gold-ink shadow-3d hover:bg-gold-300 ' +
    'active:translate-y-[4px] active:shadow-3d-pressed disabled:opacity-60 disabled:active:translate-y-0',
  secondary:
    'bg-white/85 text-ink border-2 border-white shadow-sm hover:bg-white dark:bg-white/10 dark:border-white/15 dark:hover:bg-white/15',
  ghost: 'text-ink hover:bg-white/50 dark:hover:bg-white/10',
  danger: 'bg-red-600 text-white shadow-[0_5px_0_0_#7f1d1d] active:translate-y-[3px] active:shadow-[0_2px_0_0_#7f1d1d] hover:bg-red-700 disabled:opacity-60',
};

export function Button({
  variant = 'primary',
  className,
  loading,
  children,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      type="button"
      {...p}
      disabled={p.disabled || loading}
      className={cx(
        'focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 py-3 text-base font-extrabold transition-[transform,box-shadow,background-color] duration-150 disabled:cursor-not-allowed',
        variants[variant],
        className,
      )}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx('h-5 w-5 animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('glass rounded-4xl p-4 sm:p-5', className)}>
      {children}
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error'; children: ReactNode }) {
  const t = {
    info: 'bg-white/80 text-brand-700 border-white dark:bg-sky-400/10 dark:text-sky-100 dark:border-sky-300/25',
    warn: 'bg-amber-50/95 text-amber-900 border-amber-200 dark:bg-amber-400/10 dark:text-amber-100 dark:border-amber-300/30',
    error: 'bg-red-50/95 text-red-800 border-red-200 dark:bg-red-500/15 dark:text-red-100 dark:border-red-400/30',
  }[tone];
  return (
    <div role={tone === 'error' ? 'alert' : undefined} className={cx('rounded-2xl border-2 px-3.5 py-2.5 text-sm font-semibold', t)}>
      {children}
    </div>
  );
}

export function Badge({ tone, children }: { tone: 'swap' | 'dup' | 'muted'; children: ReactNode }) {
  const t = {
    swap: 'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-200',
    dup: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200',
    muted: 'bg-white/80 text-slate-700 dark:bg-white/10 dark:text-slate-200',
  }[tone];
  return (
    <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold', t)}>{children}</span>
  );
}

export function PageState({
  kind,
  title,
  children,
}: {
  kind: 'loading' | 'empty' | 'error';
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className="glass mx-auto my-6 flex max-w-md flex-col items-center justify-center gap-3 rounded-4xl px-6 py-12 text-center"
      role={kind === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      {kind === 'loading' ? (
        <SmileLoader className="h-12 w-12" />
      ) : kind === 'empty' ? (
        <SmileLoader className="h-14 w-14" spin={false} />
      ) : (
        <div className="text-4xl" aria-hidden>
          😵
        </div>
      )}
      {title && <p className="font-display text-xl text-ink">{title}</p>}
      {children && <div className="max-w-sm text-ink-soft">{children}</div>}
    </div>
  );
}
