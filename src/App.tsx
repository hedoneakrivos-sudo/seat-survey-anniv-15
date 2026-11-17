import { Link, NavLink, Outlet } from 'react-router-dom';
import { cx } from './components/ui';
import { useMySeat } from './hooks/useMySeat';
import { useTheme } from './hooks/useTheme';
import { SkyBackdrop } from './components/SkyBackdrop';
import { Countdown } from './components/Countdown';
import { SmileLoader } from './components/theme';
import { EVENT } from './config/catConfig';

export default function App() {
  const mine = useMySeat();
  const { theme, toggle } = useTheme();
  const nav = [
    { to: '/', label: 'Denah', end: true },
    { to: '/isi', label: 'Isi Seat', end: false },
    ...(mine ? [{ to: `/seat/${mine.id}`, label: 'Seatku', end: false }] : []),
  ];
  return (
    <div className="flex min-h-dvh flex-col">
      <SkyBackdrop />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-gold-400 focus:px-4 focus:py-2 focus:font-medium focus:text-gold-ink"
      >
        Langsung ke konten
      </a>

      <header className="sticky top-0 z-30 px-3 pt-3 sm:px-4">
        <div className="glass mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 rounded-full pl-2 pr-1.5">
          <Link to="/" aria-label={`${EVENT.title} Seat Survey, beranda`} className="focus-ring flex min-w-0 items-center gap-2.5 rounded-full pr-1 sm:pr-2">
            <SmileLoader className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" spin={false} />
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-display text-base font-semibold text-ink">{EVENT.title}</span>
              <span className="hidden truncate text-xs text-ink-soft min-[430px]:block">
                Seat Survey · <Countdown className="font-medium text-[var(--link)]" />
              </span>
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-1">
          <nav aria-label="Navigasi utama" className="flex gap-1">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cx(
                    'focus-ring inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-3 text-sm font-medium transition-colors sm:px-3.5',
                    isActive ? 'bg-gold-400 text-gold-ink' : 'text-ink-soft hover:bg-[var(--soft)] hover:text-ink',
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <ThemeToggle theme={theme} onToggle={toggle} />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:py-10">
        <Outlet />
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 pb-8 pt-2 text-center text-xs text-ink-soft">
        <p className="font-medium text-ink">
          {EVENT.subtitle} · {EVENT.venue} · {EVENT.dateLabel}
        </p>
        <p className="mx-auto mt-1 max-w-xl">
          Fan project tidak resmi. Seatmap dan desain milik penyelenggara/JKT48. Tidak berafiliasi dengan JKT48 atau
          penyelenggara.
        </p>
      </footer>
    </div>
  );
}

/** Tombol matahari/bulan. Ikon menunjukkan tema yang AKAN dipakai. */
function ThemeToggle({ theme, onToggle }: { theme: 'light' | 'dark'; onToggle: () => void }) {
  const dark = theme === 'dark';
  const label = dark ? 'Ganti ke mode terang' : 'Ganti ke mode gelap';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      className="focus-ring grid h-10 w-10 place-items-center rounded-full text-ink-soft transition-colors hover:bg-[var(--soft)] hover:text-ink"
    >
      {dark ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="4.2" fill="#ffc933" stroke="#ffc933" />
          <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="currentColor" fillOpacity=".15" />
        </svg>
      )}
    </button>
  );
}
