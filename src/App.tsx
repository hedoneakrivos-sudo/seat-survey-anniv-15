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
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-gold-400 focus:px-4 focus:py-2 focus:font-bold focus:text-gold-ink"
      >
        Langsung ke konten
      </a>

      {/* bar countdown */}
      <div className="bg-gold-400 text-center text-[11px] text-gold-ink sm:text-xs">
        <Countdown className="block px-3 py-1.5" />
      </div>

      <header className="sticky top-0 z-30">
        <div className="mx-auto max-w-6xl px-3 pt-2 sm:px-4">
          <div className="glass flex items-center justify-between gap-3 rounded-full py-1.5 pl-2 pr-1.5">
            <Link to="/" className="focus-ring flex min-w-0 items-center gap-2 rounded-full pr-2">
              <SmileLoader className="hidden h-9 w-9 shrink-0 min-[380px]:block" spin={false} />
              <span className="min-w-0 leading-tight">
                <span className="title-3d block whitespace-nowrap text-base sm:text-xl" style={{ WebkitTextStroke: '1.25px var(--color-gold-ink)', textShadow: '0 2px 0 var(--color-gold-ink)' }}>
                  {EVENT.title}
                </span>
                <span className="block truncate text-[11px] font-bold text-ink-soft">Seat Survey</span>
              </span>
            </Link>
            <nav aria-label="Navigasi utama" className="flex shrink-0 gap-0.5 sm:gap-1">
              {nav.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    cx(
                      'focus-ring inline-flex min-h-10 items-center rounded-full px-2.5 text-[13px] font-extrabold transition sm:px-3.5 sm:text-sm',
                      isActive ? 'bg-gold-400 text-gold-ink shadow-[0_3px_0_0_var(--color-gold-ink)]' : 'text-ink hover:bg-white/50 dark:hover:bg-white/10',
                    )
                  }
                >
                  {n.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-3 py-5 sm:px-4 lg:py-8">
        <Outlet />
      </main>

      <footer className="mx-auto w-full max-w-6xl px-3 pb-6 sm:px-4">
        <div className="glass rounded-3xl px-4 py-3 text-center text-xs text-ink-soft">
          <p className="font-bold text-ink">
            {EVENT.subtitle} · {EVENT.venue} · {EVENT.dateLabel}
          </p>
          <p className="mt-1">
            Fan project tidak resmi. Seatmap dan desain milik penyelenggara/JKT48. Tidak berafiliasi dengan JKT48 atau
            penyelenggara.
          </p>
        </div>
      </footer>
    </div>
  );
}
