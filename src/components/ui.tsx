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
  'block w-full rounded-xl border bg-[var(--surface-2)] px-3 py-2.5 text-base text-ink transition-colors ' +
  'placeholder:text-ink-soft/70 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/25 ' +
  'disabled:opacity-60';

export const fieldClass = (error?: string, warning?: string) =>
  cx(
    fieldBase,
    error
      ? 'border-red-500 dark:border-red-400'
      : warning
        ? 'border-amber-500'
        : 'border-[var(--line-strong)]',
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
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
        {required && (
          <span className="text-red-500" aria-hidden>
            {' '}*
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p id={`${id}-msg`} role="alert" className="mt-1.5 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : warning ? (
        <p id={`${id}-msg`} className="mt-1.5 text-sm text-amber-800 dark:text-amber-300">
          {warning}
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
const variants: Record<Variant, string> = {
  primary:
    'font-display font-semibold tracking-wide bg-gold-400 text-gold-ink shadow-[0_6px_16px_-6px_rgb(232_168_0_/_0.7)] hover:bg-gold-300 active:scale-[0.98] disabled:opacity-60',
  secondary: 'border border-[var(--chip-border)] bg-[var(--chip)] text-ink hover:bg-[var(--surface-2)]',
  ghost: 'text-ink-soft hover:bg-[var(--chip)] hover:text-ink',
  danger: 'bg-red-500 text-white hover:bg-red-600 disabled:opacity-60',
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
        'focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-[background-color,transform] duration-150 disabled:cursor-not-allowed',
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
    <div className={cx('glass rounded-2xl p-4 sm:p-5', className)}>
      {children}
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error'; children: ReactNode }) {
  const t = {
    info: 'border-[var(--chip-border)] bg-[var(--chip)] text-ink',
    warn: 'border-amber-200 bg-amber-50/95 text-amber-900 dark:border-amber-300/25 dark:bg-amber-400/10 dark:text-amber-100',
    error: 'border-red-200 bg-red-50/95 text-red-800 dark:border-red-400/30 dark:bg-red-500/15 dark:text-red-100',
  }[tone];
  return (
    <div role={tone === 'error' ? 'alert' : undefined} className={cx('rounded-xl border px-3.5 py-2.5 text-sm', t)}>
      {children}
    </div>
  );
}

export function Badge({ tone, children }: { tone: 'swap' | 'dup' | 'muted'; children: ReactNode }) {
  const t = {
    swap: 'bg-[var(--swap-bg)] text-[var(--swap-ink)]',
    dup: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200',
    muted: 'bg-[var(--chip)] text-ink-soft',
  }[tone];
  return (
    <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', t)}>{children}</span>
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
      className="glass mx-auto my-10 flex max-w-md flex-col items-center justify-center gap-2 rounded-3xl px-6 py-10 text-center"
      role={kind === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      <SmileLoader className="mb-2 h-10 w-10" spin={kind === 'loading'} />
      {title && <p className="font-display text-xl font-semibold text-ink">{title}</p>}
      {children && <div className="max-w-sm text-sm text-ink-soft">{children}</div>}
    </div>
  );
}
