import { useEffect, useMemo, useRef, useState } from 'react';
import type { CategoryLayout } from '../config/seatLayout';
import { getCatInfo } from '../config/catConfig';
import { buildCategoryGeometry, type CatGeometry } from '../lib/seatGeometry';
import { buildSeatGrid, type GridSeat, type SeatGrid } from '../lib/seatGrid';
import { PLAN_SIZE, PLAN_ZONES } from '../config/seatZones2d';
import { SEAT_STATE_FILL, SEAT_STATE_LABEL, seatState } from '../lib/seatState';
import type { PublicSeat } from '../lib/types';
import { usePanZoom } from '../hooks/usePanZoom';
import { igUrl, xUrl } from '../lib/api';
import { cx } from '../lib/cx';
import { Legend } from './RowMiniMap';
import type { MapMode } from './SeatmapInteractive';
import { ReportButton } from './ReportButton';

interface Props {
  layout: CategoryLayout;
  seats: PublicSeat[];
  /** seat milik user: disorot, diberi pin, dan dijadikan pusat tampilan */
  mySeat?: { row_label: string; seat_number: number } | null;
  /** tap kursi (mis. untuk mengisi form) */
  onPickSeat?: (rowLabel: string, seatNumber: number) => void;
  /** sorot satu baris (mis. row yang sedang diisi di form) */
  highlightRow?: string | null;
  /** tidak dipakai lagi (denah 2D tidak memakai gambar seatplan) */
  mode?: MapMode;
  className?: string;
  /** tinggi area peta, mis. "h-[46vh]" */
  svgClassName?: string;
}

const geomCache = new Map<string, CatGeometry>();
/** Posisi kursi di atas seatplan (dipakai share card), di-cache per layout */
export function geometryOf(layout: CategoryLayout): CatGeometry {
  const key = `${layout.category}|${layout.rows.map((r) => `${r.label}:${r.blocks.join('.')}`).join(',')}`;
  let g = geomCache.get(key);
  if (!g) {
    g = buildCategoryGeometry(layout);
    geomCache.set(key, g);
  }
  return g;
}

const gridCache = new Map<string, SeatGrid>();
export function gridOf(layout: CategoryLayout): SeatGrid {
  const key = `${layout.category}|${layout.numbering}|${layout.rows.map((r) => `${r.label}:${r.blocks.join('.')}`).join(',')}`;
  let g = gridCache.get(key);
  if (!g) {
    g = buildSeatGrid(layout);
    gridCache.set(key, g);
  }
  return g;
}

/**
 * Denah kursi satu CAT, 2D tampak atas seperti denah bioskop:
 * panggung di atas, Row A paling depan, blok dipisah lorong.
 * Floor = baris lurus, tribun = baris melengkung (ikut bentuk zonanya).
 */
export function CategorySeatMap({
  layout,
  seats,
  mySeat,
  onPickSeat,
  highlightRow,
  className,
  svgClassName,
}: Props) {
  const grid = useMemo(() => gridOf(layout), [layout]);
  const home = grid.bbox;
  const pz = usePanZoom<SVGSVGElement>({
    home,
    minWidth: grid.seat * 10,
    bounds: { x: 0, y: 0, width: PLAN_SIZE.width, height: PLAN_SIZE.height },
  });
  const [picked, setPicked] = useState<{ row: string; n: number } | null>(null);
  const info = getCatInfo(layout.category)!;

  const bySeat = useMemo(() => {
    const m = new Map<string, PublicSeat[]>();
    for (const s of seats) {
      const k = `${s.row_label}|${s.seat_number}`;
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return m;
  }, [seats]);

  const mine = mySeat ? grid.seats.find((s) => s.row === mySeat.row_label && s.n === mySeat.seat_number) : undefined;

  // zoom ke kursi user (sekali per kursi & rasio; berhenti kalau user sudah menggeser)
  const centeredFor = useRef<string | null>(null);
  const userMoved = useRef(false);
  const { animateTo, aspect } = pz;
  useEffect(() => {
    if (!mine || userMoved.current) return;
    const key = `${mine.row}|${mine.n}|${aspect.toFixed(2)}`;
    if (centeredFor.current === key) return;
    centeredFor.current = key;
    // cukup dekat untuk baca nomor kursi
    const w = Math.min(home.width, grid.seat * 32);
    animateTo({ x: mine.x - w / 2, y: mine.y - (w * aspect) / 2, width: w, height: w * aspect }, 600);
  }, [mine, aspect, animateTo, home.width, grid.seat]);

  /** tap = kursi terdekat dari titik sentuh */
  const pickAt = (clientX: number, clientY: number) => {
    const svg = pz.ref.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return;
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    let best: GridSeat | null = null;
    let bd = Infinity;
    for (const s of grid.seats) {
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    if (!best || bd > Math.max(grid.seat * 1.2, pz.viewBox.width * 0.03)) return setPicked(null);
    setPicked({ row: best.row, n: best.n });
    onPickSeat?.(best.row, best.n);
  };

  const vb = pz.viewBox;
  const zoom = pz.scale;
  const pickedList = picked ? (bySeat.get(`${picked.row}|${picked.n}`) ?? []) : [];
  const hiRow = highlightRow ? grid.rows.find((r) => r.row === highlightRow) : undefined;
  const SEAT = grid.seat;
  // nomor kursi baru dibaca kalau kursi cukup besar di layar
  const showNumbers = vb.width < SEAT * 60;
  const labelSize = Math.min(SEAT * 1.3, Math.max(SEAT * 0.7, vb.width / 55));
  const toPts = (p: [number, number][]) => p.map((q) => q.join(',')).join(' ');

  return (
    <div className={cx('relative', className)}>
      <div className="relative overflow-hidden rounded-2xl border border-[var(--chip-border)] bg-gradient-to-b from-[var(--map-a)] to-[var(--map-b)]">
        <svg
          ref={pz.ref}
          viewBox={pz.viewBoxAttr}
          className={cx('block w-full touch-none select-none', svgClassName ?? 'h-80')}
          // tinggi mengikuti bentuk CAT (tidak ada ruang kosong besar di HP),
          // tapi tidak melebihi tinggi dari svgClassName
          style={{ aspectRatio: `${home.width} / ${home.height}`, height: 'auto', maxHeight: 'min(50vh, 520px)', minHeight: 200 }}
          role="group"
          aria-label={`Denah kursi ${layout.name} tampak atas, panggung di atas. Geser untuk melihat, cubit untuk zoom, tap kursi untuk info.`}
          {...pz.handlers}
          onPointerDownCapture={() => {
            userMoved.current = true;
          }}
          onClick={(e) => {
            if (pz.didDrag()) return;
            pickAt(e.clientX, e.clientY);
          }}
        >
          {/* CAT lain (redup) untuk konteks letak */}
          <g pointerEvents="none">
            {PLAN_ZONES.filter((z) => z.category !== layout.category).map((z) => (
              <polygon key={z.id} points={z.points} fill={getCatInfo(z.category)!.color} fillOpacity={0.16} />
            ))}
          </g>

          {/* panggung (main stage + catwalk + island) */}
          <g pointerEvents="none">
            <polygon points={toPts(grid.stage)} fill="var(--stage)" fillOpacity={0.9} strokeLinejoin="round" />
            <text
              x={grid.island[0]}
              y={grid.island[1] + SEAT * 0.8}
              textAnchor="middle"
              fontSize={Math.max(SEAT * 2.2, 12)}
              fontWeight={600}
              fill="var(--stage-ink)"
              letterSpacing={1.5}
            >
              PANGGUNG
            </text>
          </g>

          {/* zona CAT ini */}
          <g pointerEvents="none">
            {grid.zones.map((z, i) => (
              <polygon
                key={i}
                points={toPts(z)}
                fill={info.color}
                fillOpacity={0.12}
                stroke={info.color}
                strokeOpacity={0.7}
                strokeWidth={Math.max(0.6, vb.width / 500)}
                strokeLinejoin="round"
              />
            ))}
          </g>

          {/* sorotan baris */}
          {hiRow?.path.map((line, i) => (
            <polyline
              key={i}
              points={line.map((p) => p.join(',')).join(' ')}
              fill="none"
              stroke="#f5c443"
              strokeOpacity={0.5}
              strokeWidth={SEAT * 1.7}
              strokeLinecap="round"
              strokeLinejoin="round"
              pointerEvents="none"
            />
          ))}

          {/* kursi */}
          <g>
            {grid.seats.map((s) => {
              const list = bySeat.get(`${s.row}|${s.n}`);
              const isMine = mine === s;
              const st = seatState(list, isMine);
              const isPicked = picked?.row === s.row && picked?.n === s.n;
              const empty = st === 'empty';
              const z = s.size;
              return (
                <g key={`${s.row}|${s.n}`} transform={`translate(${s.x} ${s.y}) rotate(${s.angle})`}>
                  <rect
                    x={-z / 2}
                    y={-z / 2}
                    width={z}
                    height={z}
                    rx={z * 0.25}
                    fill={empty ? info.color : SEAT_STATE_FILL[st]}
                    fillOpacity={empty ? 'var(--seat-empty-opacity)' : 1}
                    stroke={isPicked ? '#e8a800' : isMine ? 'var(--ink)' : 'transparent'}
                    strokeWidth={isPicked || isMine ? z * 0.22 : 0}
                  />
                  {showNumbers && z > SEAT * 0.7 && (
                    <text
                      y={z * 0.17}
                      textAnchor="middle"
                      transform={`rotate(${-s.angle})`}
                      fontSize={s.n >= 100 ? z * 0.4 : z * 0.48}
                      fontWeight={500}
                      fill={empty ? 'var(--seat-empty-ink)' : '#fff'}
                      fillOpacity={empty ? 0.8 : 1}
                      pointerEvents="none"
                    >
                      {s.n}
                    </text>
                  )}
                </g>
              );
            })}
          </g>

          {/* label baris di kedua ujung (saat cukup zoom) */}
          {zoom > 1.3 && (
            <g pointerEvents="none" fontWeight={600} fontSize={labelSize}>
              {grid.rows.map((r) =>
                [r.left, r.right].map(([x, y], i) => (
                  <text
                    key={`${r.row}${i}`}
                    x={x}
                    y={y + labelSize * 0.35}
                    textAnchor="middle"
                    fill={r.row === highlightRow ? 'var(--color-gold-500)' : 'var(--row-label)'}
                    stroke="var(--map-b)"
                    strokeWidth={labelSize * 0.22}
                    paintOrder="stroke"
                  >
                    {r.row}
                  </text>
                )),
              )}
            </g>
          )}

          {/* pin smiley di kursi user */}
          {mine && <Pin x={mine.x} y={mine.y - SEAT * 0.6} size={Math.max(SEAT * 2.6, vb.width * 0.045)} />}
        </svg>

        <div className="absolute bottom-2 right-2 flex gap-1.5">
          <MiniBtn label="Perbesar" onClick={() => pz.zoomBy(1.8, undefined, true)}>
            +
          </MiniBtn>
          <MiniBtn label="Perkecil" onClick={() => pz.zoomBy(1 / 1.8, undefined, true)}>
            −
          </MiniBtn>
          <MiniBtn label="Lihat seluruh CAT" onClick={pz.reset} disabled={zoom < 1.02}>
            ⤢
          </MiniBtn>
        </div>
      </div>

      {/* info kursi yang di-tap */}
      <div aria-live="polite" className="mt-2 min-h-11">
        {picked ? (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-ink">
                {layout.name} · Row {picked.row} · No. {picked.n}
              </span>
              <button
                type="button"
                onClick={() => setPicked(null)}
                className="focus-ring rounded-full px-2 text-ink-soft"
                aria-label="Tutup info kursi"
              >
                ✕
              </button>
            </div>
            {pickedList.length === 0 ? (
              <p className="text-ink-soft">Belum ada yang isi.</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {pickedList.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold text-ink">{s.nickname}</span>
                    <span className="text-ink-soft">{s.sex === 'M' ? 'L' : 'P'}</span>
                    {s.want_swap && <span className="font-bold text-[var(--swap-ink)]">MAU TUKAR</span>}
                    {s.is_duplicate && <span className="font-bold text-red-600 dark:text-red-300">duplikat</span>}
                    {s.x_username && (
                      <a className="underline decoration-gold-500" href={xUrl(s.x_username)} target="_blank" rel="noopener noreferrer nofollow">
                        X @{s.x_username}
                      </a>
                    )}
                    {s.ig_username && (
                      <a className="underline decoration-gold-500" href={igUrl(s.ig_username)} target="_blank" rel="noopener noreferrer nofollow">
                        IG @{s.ig_username}
                      </a>
                    )}
                    <ReportButton seatId={s.id} nickname={s.nickname} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="text-xs text-ink-soft">Tap kursi untuk lihat siapa yang duduk di situ.</p>
        )}
      </div>

      <Legend />
      <p className="mt-1 text-xs text-ink-soft">
        Denah tampak atas sesuai seatplan (posisi kursi perkiraan) · {layout.rows.length} baris · {layout.capacity} kursi
        {picked ? ` · ${SEAT_STATE_LABEL[seatState(pickedList, false)]}` : ''}
      </p>
    </div>
  );
}

function Pin({ x, y, size }: { x: number; y: number; size: number }) {
  const s = size / 40;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} pointerEvents="none" role="img" aria-label="Kursi kamu">
      <path d="M0 0 C-14 -22 -18 -30 -18 -40 A18 18 0 1 1 18 -40 C18 -30 14 -22 0 0Z" fill="#f5c443" />
      <circle cx={0} cy={-40} r={6.5} fill="#1a1405" />
    </g>
  );
}

function MiniBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="focus-ring grid h-9 w-9 place-items-center rounded-full border border-[var(--soft-border)] bg-[var(--surface-2)] text-base text-ink shadow-lift transition-colors hover:bg-[var(--soft)] disabled:text-ink-soft/50"
    >
      {children}
    </button>
  );
}
