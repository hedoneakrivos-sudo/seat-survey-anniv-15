import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { SeatForm } from '../components/SeatForm';
import { SeatmapInteractive, CatChipBar } from '../components/SeatmapInteractive';
import { CategorySeatMap } from '../components/CategorySeatMap';
import { CatInfoPanel } from '../components/CatInfoPanel';
import { GlassCard } from '../components/theme';
import { Card, Notice, cx } from '../components/ui';
import { friendlyError, submitSeat } from '../lib/api';
import { newEditToken, setMySeat } from '../lib/storage';
import { useMySeat } from '../hooks/useMySeat';
import { supabaseConfigured } from '../lib/supabase';
import { emptyForm, normCode, type SeatFormValues } from '../lib/validation';
import { useIsDesktop } from '../hooks/useMediaQuery';
import { useCategoryStats } from '../hooks/useCategoryStats';
import { useCategorySeats } from '../hooks/useCategorySeats';
import { EVENT } from '../config/catConfig';
import { getCategory } from '../lib/layout';

type Patch = { seq: number; values: Partial<SeatFormValues> };

export default function SubmitPage() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const [initial] = useState<SeatFormValues>(() => {
    const c = Number(params.get('cat'));
    return { ...emptyForm(), category: c >= 1 && c <= 7 ? c : null };
  });
  const [draft, setDraft] = useState<SeatFormValues>(initial);
  const [patch, setPatch] = useState<Patch | null>(null);
  const seq = useRef(0);
  const existing = useMySeat();
  const flash = (useLocation().state as { flash?: string } | null)?.flash;
  const { stats } = useCategoryStats();
  const [mapView, setMapView] = useState<'venue' | 'detail'>('venue');
  // drawer form di desktop: terbuka otomatis kalau CAT sudah dipilih
  const [drawerOpen, setDrawerOpen] = useState(!!initial.category);

  const category = draft.category;
  const layout = getCategory(category);
  const catSeats = useCategorySeats(mapView === 'detail' ? category : null);

  const applyPatch = (values: Partial<SeatFormValues>) => setPatch({ seq: ++seq.current, values });

  // form → URL: CAT terpilih tercermin di ?cat=, supaya refresh/back konsisten
  const onChange = useCallback(
    (v: SeatFormValues) => {
      setDraft(v);
      setParams(
        (p) => {
          const cur = p.get('cat');
          const next = v.category ? String(v.category) : null;
          if (cur === next) return p;
          const n = new URLSearchParams(p);
          if (next) n.set('cat', next);
          else n.delete('cat');
          return n;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // denah → form
  const pickCategory = (cat: number) => {
    applyPatch({ category: cat });
    setDrawerOpen(true);
  };
  const pickSeat = (row: string, n: number) => {
    applyPatch({ row_label: row, seat_number: String(n) });
    setDrawerOpen(true);
  };

  // pindah CAT dari form → kembali ke denah venue kalau CAT baru belum punya layout
  useEffect(() => {
    if (!layout && mapView === 'detail') setMapView('venue');
  }, [layout, mapView]);

  const onSubmit = async (v: SeatFormValues, force: boolean): Promise<'ok' | 'seat_taken'> => {
    setError(null);
    const token = newEditToken();
    try {
      const row = await submitSeat(v, token, force);
      setMySeat({ id: row.id, editToken: token });
      navigate(`/seat/${row.id}`, { state: { flash: '🎉 Berhasil! Seat kamu sudah tercatat.', celebrate: true } });
      return 'ok';
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? '';
      if (msg.includes('SEAT_TAKEN')) return 'seat_taken';
      setError(friendlyError(e));
      return 'ok';
    }
  };

  const notices = (
    <>
      {flash && <Notice tone="info">{flash}</Notice>}
      {!supabaseConfigured && (
        <Notice tone="warn">
          Mode demo: database belum disetel (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). Form bisa dicoba, tapi
          belum bisa dikirim.
        </Notice>
      )}
      {existing && (
        <Notice tone="info">
          Kamu sudah pernah isi dari perangkat ini.{' '}
          <Link className="font-bold underline" to={`/seat/${existing.id}`}>
            Lihat seat kamu
          </Link>
        </Notice>
      )}
    </>
  );

  const form = (
    <SeatForm
      initial={initial}
      patch={patch}
      submitLabel="Kirim seat"
      onSubmit={onSubmit}
      onChange={onChange}
      serverError={error}
    />
  );

  const map = (
    <GlassCard className="!p-2">
      <div className="mb-2 flex items-center gap-2 px-1 pt-1">
        <div
          role="tablist"
          aria-label="Tampilan peta"
          className="flex rounded-full border-2 border-white bg-white/70 p-0.5 dark:border-white/15 dark:bg-white/10"
        >
          <Tab active={mapView === 'venue'} onClick={() => setMapView('venue')}>
            Denah
          </Tab>
          <Tab active={mapView === 'detail'} onClick={() => setMapView('detail')} disabled={!layout}>
            Kursi {category ? `CAT ${category}` : ''}
          </Tab>
        </div>
        {mapView === 'detail' && (
          <span className="ml-auto text-xs font-bold text-ink-soft">Tap kursi untuk isi Row & No.</span>
        )}
      </div>
      {mapView === 'venue' || !layout ? (
        <>
          <SeatmapInteractive
            selected={category}
            onSelect={pickCategory}
            stats={stats}
            className={isDesktop ? 'h-[min(60vh,560px)]' : 'h-[38vh] min-h-56'}
          />
          <div className="px-1 pt-2">
            <CatChipBar selected={category} onSelect={pickCategory} stats={stats} />
          </div>
        </>
      ) : (
        <CategorySeatMap
          key={layout.category}
          layout={layout}
          seats={catSeats.seats}
          highlightRow={normCode(draft.row_label) || null}
          mySeat={
            draft.row_label && Number(draft.seat_number) >= 1
              ? { row_label: normCode(draft.row_label), seat_number: Number(draft.seat_number) }
              : null
          }
          onPickSeat={pickSeat}
          svgClassName={isDesktop ? 'h-[min(56vh,520px)]' : 'h-[38vh] min-h-56'}
        />
      )}
    </GlassCard>
  );

  const header = (
    <header className="text-center lg:text-left">
      <p className="text-pixel text-xs font-bold text-white drop-shadow-[0_1px_0_rgb(0_0_0_/_0.35)] sm:text-sm">
        {EVENT.subtitle}
      </p>
      <h1 id="form-title" className="title-3d mt-1 text-4xl leading-none sm:text-5xl">
        Kamu duduk di mana?
      </h1>
      <p className="mt-3 font-semibold text-ink">Pilih CAT di denah, terus isi seat kamu 😊</p>
      <p className="text-pixel mt-2 text-[11px] text-gold-ink sm:text-xs">
        <span className="rounded-full bg-gold-400 px-2.5 py-1">
          {EVENT.venue} | {EVENT.dateLabel}
        </span>
      </p>
    </header>
  );

  // ---------------- mobile: peta di atas, form di bawah ----------------
  if (!isDesktop) {
    return (
      <section aria-labelledby="form-title" className="space-y-4">
        {header}
        <div className="space-y-2">{notices}</div>
        {map}
        <Card>{form}</Card>
      </section>
    );
  }

  // ---------------- desktop: peta besar + side drawer berisi form ----------------
  return (
    <section aria-labelledby="form-title" className="space-y-4">
      {header}
      <div className="space-y-2">{notices}</div>
      <div
        className={cx(
          'grid items-start gap-5 transition-[grid-template-columns] duration-300',
          drawerOpen ? 'grid-cols-[minmax(0,1fr)_27rem]' : 'grid-cols-[minmax(0,1fr)_3.5rem]',
        )}
      >
        <div className="space-y-3">
          {map}
          {category && (
            <GlassCard>
              <CatInfoPanel
                category={category}
                stats={stats[category]}
                onFill={() => {
                  setDrawerOpen(true);
                  requestAnimationFrame(() => document.getElementById('f-gate')?.focus());
                }}
                ctaLabel="Lanjut isi Gate, Row, No."
              />
            </GlassCard>
          )}
        </div>

        <aside
          aria-label="Form isi seat"
          className="glass sticky top-24 max-h-[calc(100dvh-7rem)] overflow-hidden rounded-4xl"
        >
          <button
            type="button"
            onClick={() => setDrawerOpen((o) => !o)}
            aria-expanded={drawerOpen}
            aria-controls="seat-drawer"
            className="focus-ring flex w-full items-center justify-between gap-2 px-4 py-3 font-display text-lg text-ink"
          >
            {drawerOpen ? (
              <>
                <span>Isi seat kamu</span>
                <span aria-hidden>⟩</span>
                <span className="sr-only">Tutup form</span>
              </>
            ) : (
              <span className="mx-auto [writing-mode:vertical-rl]" title="Buka form">
                ⟨ Isi seat
              </span>
            )}
          </button>
          <div id="seat-drawer" hidden={!drawerOpen} className="max-h-[calc(100dvh-11rem)] overflow-y-auto px-4 pb-4">
            {form}
          </div>
        </aside>
      </div>
    </section>
  );
}

function Tab({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      disabled={disabled}
      className={
        'focus-ring min-h-9 rounded-full px-3 text-sm font-extrabold transition disabled:opacity-40 ' +
        (active ? 'bg-gold-400 text-gold-ink' : 'text-ink')
      }
    >
      {children}
    </button>
  );
}
