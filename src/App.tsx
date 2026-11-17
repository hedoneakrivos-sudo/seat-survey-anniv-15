import { Link, NavLink, Outlet } from 'react-router-dom';
import { cx } from './components/ui';
import { useMySeat } from './hooks/useMySeat';
import { SkyBackdrop } from './components/SkyBackdrop';
import { Countdown } from './components/Countdown';
import { SmileLoader } from './components/theme';
import { EVENT } from './config/catConfig';

export default function App() {
  const mine = useMySeat();
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
          <Link to="/" className="focus-ring flex min-w-0 items-center gap-2.5 rounded-full pr-2">
            <SmileLoader className="h-9 w-9 shrink-0" spin={false} />
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-display text-base font-semibold text-ink">{EVENT.title}</span>
              <span className="block truncate text-xs text-ink-soft">
                Seat Survey · <Countdown className="font-medium text-[#1d6fd6]" />
              </span>
            </span>
          </Link>
          <nav aria-label="Navigasi utama" className="flex shrink-0 gap-1">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cx(
                    'focus-ring inline-flex min-h-10 items-center rounded-full px-3.5 text-sm font-medium transition-colors',
                    isActive ? 'bg-gold-400 text-gold-ink' : 'text-ink-soft hover:bg-sky-50 hover:text-ink',
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
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
