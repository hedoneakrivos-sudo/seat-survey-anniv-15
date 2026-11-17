import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SeatmapInteractive } from '../components/SeatmapInteractive';
import { CategorySeatMap } from '../components/CategorySeatMap';
import { CatCounters } from '../components/CatCounters';
import { CatInfoPanel } from '../components/CatInfoPanel';
import { HotspotEditor } from '../components/HotspotEditor';
import { Sheet } from '../components/Sheet';
import { GlassCard, SmileLoader } from '../components/theme';
import { Notice } from '../components/ui';
import { EVENT, getCatInfo } from '../config/catConfig';
import { getCategory } from '../lib/layout';
import { useIsDesktop } from '../hooks/useMediaQuery';
import { useCategoryStats } from '../hooks/useCategoryStats';
import { useCategorySeats } from '../hooks/useCategorySeats';
import { useMySeat } from '../hooks/useMySeat';
import { getSeat } from '../lib/api';
import type { PublicSeat } from '../lib/types';

export default function MapPage() {
  const [params, setParams] = useSearchParams();
  // editor hotspot hanya tersedia di dev server
  if (import.meta.env.DEV && params.get('editor') === '1') return <HotspotEditor />;
  return <MapView params={params} setParams={setParams} />;
}

function MapView({
  params,
  setParams,
}: {
  params: URLSearchParams;
  setParams: ReturnType<typeof useSearchParams>[1];
}) {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const { stats, status } = useCategoryStats();
  const mine = useMySeat();
  const [mySeatRow, setMySeatRow] = useState<PublicSeat | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [heatmap, setHeatmap] = useState(false);
  const [swapOnly, setSwapOnly] = useState(false);
  /** 'venue' = denah isometrik, 'detail' = peta kursi per CAT (?view=detail) */
  const view: 'venue' | 'detail' = params.get('view') === 'detail' ? 'detail' : 'venue';

  const catParam = Number(params.get('cat'));
  const selected = getCatInfo(catParam) ? catParam : null;
  const layout = getCategory(selected);
  const detail = useCategorySeats(view === 'detail' ? selected : null);

  const update = useCallback(
    (patch: Record<string, string | null>) =>
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          for (const [k, v] of Object.entries(patch)) (v === null ? n.delete(k) : n.set(k, v));
          return n;
        },
        { replace: true },
      ),
    [setParams],
  );

  const select = useCallback(
    (cat: number) => {
      update({ cat: String(cat) });
      if (!isDesktop && view === 'venue') setSheetOpen(true);
    },
    [update, isDesktop, view],
  );
  const setView = (v: 'venue' | 'detail') => update({ view: v === 'detail' ? 'detail' : null });

  useEffect(() => {
    if (!mine) return setMySeatRow(null);
    let off = false;
    getSeat(mine.id)
      .then((s) => !off && setMySeatRow(s))
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [mine]);

  const fill = (cat: number) => navigate(`/isi?cat=${cat}`);

  const totalAll = Object.values(stats).reduce((a, s) => a + s.total, 0);
  const myCatSeat = selected && mySeatRow?.category === selected ? mySeatRow : null;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-pixel text-xs text-white/85">{EVENT.subtitle}</p>
        <h1 className="title-3d mt-2 text-4xl sm:text-5xl">Pilih CAT kamu ☀️</h1>
        <p className="mt-2 text-sm text-white/90 sm:text-base">
          Tap zona di denah, lalu isi seat kamu.
          {status === 'ok' && totalAll > 0 && (
            <>
              {' '}
              <span className="whitespace-nowrap font-semibold text-white">{totalAll} orang</span> sudah isi.
            </>
          )}
        </p>
      </header>

      {status === 'error' && <Notice tone="warn">Angka pengisi belum bisa dimuat. Peta tetap bisa dipakai.</Notice>}

      {/* counter live per CAT */}
      <CatCounters stats={stats} selected={selected} onSelect={select} loading={status === 'loading'} />

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div
              role="tablist"
              aria-label="Tampilan peta"
              className="flex rounded-full border border-white/90 bg-white/75 p-1"
            >
              <ViewTab active={view === 'venue'} onClick={() => setView('venue')}>
                Denah
              </ViewTab>
              <ViewTab active={view === 'detail'} onClick={() => setView('detail')} disabled={!selected}>
                Kursi{selected ? ` CAT ${selected}` : ''}
              </ViewTab>
            </div>
            {view === 'venue' && (
              <>
                <Toggle on={heatmap} onClick={() => setHeatmap((v) => !v)} label="Mode heatmap">
                  <span aria-hidden>🔥</span>
                  <span className="hidden sm:inline">Heatmap</span>
                </Toggle>
                <Toggle on={swapOnly} onClick={() => setSwapOnly((v) => !v)} label="Tampilkan hanya yang mau tukar">
                  <span aria-hidden>🔁</span>
                  <span className="hidden sm:inline">Mau tukar</span>
                </Toggle>
              </>
            )}
          </div>

          <GlassCard className="overflow-hidden rounded-3xl !p-1.5">
            {view === 'venue' ? (
              <>
                <SeatmapInteractive
                  selected={selected}
                  onSelect={select}
                  stats={stats}
                  myCategory={mySeatRow?.category ?? null}
                  heatmap={heatmap}
                  swapOnly={swapOnly}
                  className="aspect-[19/12] w-full overflow-hidden rounded-[1.25rem] lg:aspect-auto lg:h-[min(62vh,600px)]"
                />
              </>
            ) : layout ? (
              <div className="p-2.5">
                <CategorySeatMap
                  key={layout.category}
                  layout={layout}
                  seats={detail.seats}
                  mySeat={myCatSeat ? { row_label: myCatSeat.row_label, seat_number: myCatSeat.seat_number } : null}
                  svgClassName="h-[46vh] min-h-64 sm:h-[52vh] lg:h-[min(58vh,560px)]"
                />
                {detail.status === 'loading' && (
                  <p className="mt-1 text-sm text-ink-soft" aria-live="polite">
                    Memuat kursi…
                  </p>
                )}
                {detail.status === 'error' && <Notice tone="warn">Data kursi belum bisa dimuat.</Notice>}
              </div>
            ) : (
              <p className="p-8 text-center text-sm text-ink-soft">Pilih CAT dulu untuk lihat peta kursinya.</p>
            )}
          </GlassCard>
        </div>

        {/* panel kanan (desktop) */}
        {isDesktop && (
          <GlassCard as="aside" className="sticky top-24 mt-0 rounded-3xl">
            {selected ? (
              <>
                <CatInfoPanel category={selected} stats={stats[selected]} onFill={() => fill(selected)} />
                {view === 'venue' && (
                  <button
                    type="button"
                    onClick={() => setView('detail')}
                    className="focus-ring mt-2 min-h-11 w-full rounded-full border border-sky-100 bg-sky-50 text-sm font-medium text-ink transition-colors hover:bg-sky-100"
                  >
                    🪑 Lihat kursi CAT {selected}
                  </button>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center py-8 text-center">
                <SmileLoader className="mb-3 h-12 w-12" spin={false} />
                <p className="font-display text-xl font-semibold text-ink">Pilih zona di denah</p>
                <p className="mt-1 text-sm text-ink-soft">Arahkan kursor ke zona untuk lihat harga dan jumlah pengisi.</p>
              </div>
            )}
          </GlassCard>
        )}
      </div>

      {/* bottom sheet (mobile) */}
      {!isDesktop && selected && (
        <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={getCatInfo(selected)!.name}>
          <CatInfoPanel category={selected} stats={stats[selected]} onFill={() => fill(selected)} hideChip />
          <button
            type="button"
            onClick={() => {
              setSheetOpen(false);
              setView('detail');
            }}
            className="focus-ring mt-2 min-h-12 w-full rounded-full border border-sky-100 bg-sky-50 text-sm font-medium text-ink"
          >
            🪑 Lihat kursi CAT {selected}
          </button>
        </Sheet>
      )}

      {/* tombol utama sticky di mobile */}
      {!isDesktop && selected && !sheetOpen && (
        <div className="sticky bottom-3 z-20 flex justify-center">
          <button
            type="button"
            onClick={() => (view === 'detail' ? fill(selected) : setSheetOpen(true))}
            className="focus-ring inline-flex min-h-13 items-center gap-2 rounded-full bg-gold-400 py-3 pl-3 pr-6 font-display text-base font-semibold text-gold-ink shadow-[0_10px_24px_-8px_rgb(232_168_0_/_0.8)]"
          >
            <SmileLoader className="h-7 w-7" spin={false} />
            {view === 'detail' ? `Isi seat di CAT ${selected}` : `Lihat ${getCatInfo(selected)!.name}`}
          </button>
        </div>
      )}
    </div>
  );
}

function Toggle({
  on,
  onClick,
  label,
  children,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={
        'focus-ring inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors ' +
        (on ? 'border-gold-400 bg-gold-400 text-gold-ink' : 'border-white/90 bg-white/75 text-ink hover:bg-white')
      }
    >
      {children}
    </button>
  );
}

function ViewTab({
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
        'focus-ring min-h-9 whitespace-nowrap rounded-full px-3.5 text-sm font-medium transition-colors disabled:opacity-40 ' +
        (active ? 'bg-gold-400 text-gold-ink' : 'text-ink-soft hover:text-ink')
      }
    >
      {children}
    </button>
  );
}
