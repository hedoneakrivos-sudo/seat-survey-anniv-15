import { useEffect, useMemo, useRef, useState } from 'react';
import type { CategoryLayout } from '../config/seatLayout';
import { MAP_VIEWBOX, SEATMAP_SIZE, STAGES, STAGE_OUTLINE, ZONES } from '../config/seatmapHotspots';
import { getCatInfo } from '../config/catConfig';
import { buildCategoryGeometry, seatsBBox, type CatGeometry } from '../lib/seatGeometry';
import { SEAT_STATE_FILL, SEAT_STATE_LABEL, seatState } from '../lib/seatState';
import type { PublicSeat } from '../lib/types';
import { usePanZoom } from '../hooks/usePanZoom';
import { igUrl, xUrl } from '../lib/api';
import { cx } from '../lib/cx';
import { Legend } from './RowMiniMap';
import { pickImage, type MapMode } from './SeatmapInteractive';
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
  mode?: MapMode;
  className?: string;
  /** tinggi area peta, mis. "h-[46vh]" */
  svgClassName?: string;
}

const geomCache = new Map<string, CatGeometry>();
/** Geometri mahal dihitung (grid sampling), jadi di-cache per layout */
export function geometryOf(layout: CategoryLayout): CatGeometry {
  const key = `${layout.category}|${layout.rows.map((r) => `${r.label}:${r.blocks.join('.')}`).join(',')}`;
  let g = geomCache.get(key);
  if (!g) {
    g = buildCategoryGeometry(layout);
    geomCache.set(key, g);
  }
  return g;
}

/**
 * Peta kursi satu CAT yang mengikuti bentuk zona di seatplan (isometrik).
 * Kursi = perkiraan posisi di dalam poligon zona aslinya, warna = status.
 */
export function CategorySeatMap({
  layout,
  seats,
  mySeat,
  onPickSeat,
  highlightRow,
  mode = 'image',
  className,
  svgClassName,
}: Props) {
  const geom = useMemo(() => geometryOf(layout), [layout]);
  const home = useMemo(() => seatsBBox(geom.seats, 45) ?? MAP_VIEWBOX, [geom]);
  const pz = usePanZoom<SVGSVGElement>({
    home,
    minWidth: 70,
    bounds: { x: 0, y: 0, width: SEATMAP_SIZE.width, height: SEATMAP_SIZE.height },
  });
  const [imageSrc] = useState(pickImage);
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

  const mine = mySeat ? geom.seats.find((s) => s.row === mySeat.row_label && s.n === mySeat.seat_number) : undefined;

  // zoom ke kursi user (sekali per kursi & rasio; berhenti kalau user sudah menggeser)
  const centeredFor = useRef<string | null>(null);
  const userMoved = useRef(false);
  const { animateTo, aspect } = pz;
  useEffect(() => {
    if (!mine || userMoved.current) return;
    const key = `${mine.row}|${mine.n}|${aspect.toFixed(2)}`;
    if (centeredFor.current === key) return;
    centeredFor.current = key;
    const w = Math.max(110, mine.r * 34);
    animateTo({ x: mine.x - w / 2, y: mine.y - w * 0.3, width: w, height: w * 0.6 }, 600);
  }, [mine, aspect, animateTo]);

  /** tap = kursi terdekat dari titik sentuh (kursi kecil susah di-tap persis) */
  const pickAt = (clientX: number, clientY: number) => {
    const svg = pz.ref.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return;
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    const limit = pz.viewBox.width * 0.045;
    let best: (typeof geom.seats)[number] | null = null;
    let bd = Infinity;
    for (const s of geom.seats) {
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    if (!best || bd > Math.max(limit, best.r * 1.5)) return setPicked(null);
    setPicked({ row: best.row, n: best.n });
    onPickSeat?.(best.row, best.n);
  };

  const vb = pz.viewBox;
  const zoom = pz.scale;
  const pickedList = picked ? (bySeat.get(`${picked.row}|${picked.n}`) ?? []) : [];
  const catZones = ZONES.filter((z) => z.category === layout.category);
  const hiRow = highlightRow ? geom.rows.find((r) => r.row === highlightRow) : undefined;

  return (
    <div className={cx('relative', className)}>
      <div className="relative overflow-hidden rounded-3xl bg-[var(--sky-b)]">
        <svg
          ref={pz.ref}
          viewBox={pz.viewBoxAttr}
          className={cx('block w-full touch-none select-none', svgClassName ?? 'h-80')}
          role="group"
          aria-label={`Perkiraan posisi kursi ${layout.name} di denah. Geser untuk melihat, cubit untuk zoom, tap kursi untuk info.`}
          {...pz.handlers}
          onPointerDownCapture={() => {
            userMoved.current = true;
          }}
          onClick={(e) => {
            if (pz.didDrag()) return;
            pickAt(e.clientX, e.clientY);
          }}
        >
          {/* latar: gambar seatplan atau versi bersih */}
          {mode === 'image' ? (
            <image
              href={imageSrc}
              x={MAP_VIEWBOX.x}
              y={MAP_VIEWBOX.y}
              width={MAP_VIEWBOX.width}
              height={MAP_VIEWBOX.height}
              preserveAspectRatio="none"
            />
          ) : (
            <g>
              <polygon points={STAGE_OUTLINE} fill="#eef1f5" stroke="#b7c0cc" strokeWidth={2} />
              {ZONES.map((z) => (
                <polygon key={z.id} points={z.points} fill={getCatInfo(z.category)!.color} opacity={0.5} />
              ))}
              {STAGES.map((s) => (
                <text
                  key={s.id}
                  x={s.x}
                  y={s.y}
                  transform={`rotate(${s.rotate} ${s.x} ${s.y})`}
                  textAnchor="middle"
                  fontSize={20}
                  fontWeight={900}
                  fill="#1a1a1a"
                >
                  {s.label}
                </text>
              ))}
            </g>
          )}
          {/* redupkan CAT lain, terangkan CAT ini */}
          <rect x={0} y={0} width={SEATMAP_SIZE.width} height={SEATMAP_SIZE.height} fill="#0b1440" opacity={0.42} />
          {catZones.map((z) => (
            <polygon
              key={z.id}
              points={z.points}
              fill={info.color}
              fillOpacity={0.55}
              stroke="#fff"
              strokeWidth={Math.max(0.8, vb.width / 400)}
              strokeLinejoin="round"
            />
          ))}

          {/* sorotan baris */}
          {hiRow?.path.map((line, i) => (
            <polyline
              key={i}
              points={line.map((p) => p.join(',')).join(' ')}
              fill="none"
              stroke="#ffc928"
              strokeOpacity={0.75}
              strokeWidth={(geom.seats[0]?.r ?? 4) * 2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {/* kursi */}
          <g>
            {geom.seats.map((s) => {
              const list = bySeat.get(`${s.row}|${s.n}`);
              const isMine = mine === s;
              const st = seatState(list, isMine);
              const size = isMine ? s.r * 1.5 : s.r;
              const isPicked = picked?.row === s.row && picked?.n === s.n;
              return (
                <rect
                  key={`${s.row}|${s.n}`}
                  x={s.x - size / 2}
                  y={s.y - size / 2}
                  width={size}
                  height={size}
                  rx={size * 0.28}
                  fill={SEAT_STATE_FILL[st]}
                  stroke={isPicked ? '#ffc928' : isMine ? '#1e3a8a' : 'rgb(0 0 0 / .35)'}
                  strokeWidth={isPicked ? size * 0.3 : size * 0.12}
                />
              );
            })}
          </g>

          {/* label baris (saat cukup zoom) */}
          {zoom > 1.6 &&
            geom.rows.map((r) => {
              const first = r.path[0]?.[0];
              if (!first) return null;
              const fs = Math.max(3, (geom.seats[0]?.r ?? 4) * 1.4);
              return (
                <text
                  key={r.row}
                  x={first[0] - fs * 1.1}
                  y={first[1] + fs * 0.35}
                  textAnchor="end"
                  fontSize={fs}
                  fontWeight={900}
                  fill="#fff"
                  stroke="#0b1440"
                  strokeWidth={fs * 0.18}
                  paintOrder="stroke"
                  pointerEvents="none"
                >
                  {r.row}
                </text>
              );
            })}

          {/* nomor kursi (saat zoom dekat) */}
          {zoom > 4 &&
            geom.seats
              .filter((s) => s.x > vb.x && s.x < vb.x + vb.width && s.y > vb.y && s.y < vb.y + vb.height)
              .map((s) => (
                <text
                  key={`n${s.row}${s.n}`}
                  x={s.x}
                  y={s.y + s.r * 0.22}
                  textAnchor="middle"
                  fontSize={s.r * 0.6}
                  fontWeight={800}
                  fill="#0b1440"
                  pointerEvents="none"
                >
                  {s.n}
                </text>
              ))}

          {/* pin smiley di kursi user */}
          {mine && <Pin x={mine.x} y={mine.y - mine.r} size={vb.width * 0.045} />}
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
          <div className="rounded-2xl border-2 border-white bg-white/85 px-3 py-2 text-sm dark:border-white/15 dark:bg-white/10">
            <div className="flex items-center justify-between gap-2">
              <span className="font-extrabold text-ink">
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
                    {s.want_swap && <span className="font-bold text-orange-600 dark:text-orange-300">MAU TUKAR</span>}
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
      <p className="mt-1 text-[11px] text-ink-soft">
        Posisi kursi = perkiraan dari bentuk zona di seatplan · {layout.rows.length} baris · {layout.capacity} kursi
        {picked ? ` · ${SEAT_STATE_LABEL[seatState(pickedList, false)]}` : ''}
      </p>
    </div>
  );
}

function Pin({ x, y, size }: { x: number; y: number; size: number }) {
  const s = size / 40;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} pointerEvents="none" role="img" aria-label="Kursi kamu">
      <path d="M0 0 C-14 -22 -18 -30 -18 -40 A18 18 0 1 1 18 -40 C18 -30 14 -22 0 0Z" fill="#ffc928" stroke="#5a3a00" strokeWidth={3} />
      <circle cx={-6} cy={-44} r={2.6} fill="#5a3a00" />
      <circle cx={6} cy={-44} r={2.6} fill="#5a3a00" />
      <path d="M-8 -37 Q0 -29 8 -37" fill="none" stroke="#5a3a00" strokeWidth={3} strokeLinecap="round" />
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
      className="focus-ring grid h-10 w-10 place-items-center rounded-full border-2 border-white bg-white/90 font-black text-[#0f2747] shadow-sm disabled:opacity-40 dark:border-white/15 dark:bg-[#141b4a]/90 dark:text-white"
    >
      {children}
    </button>
  );
}
