import { useEffect, useMemo, useRef, useState } from 'react';
import type { CategoryLayout } from '../config/seatLayout';
import { getCatInfo } from '../config/catConfig';
import { buildCategoryGeometry, type CatGeometry } from '../lib/seatGeometry';
import { buildSeatGrid, PITCH, ROW_GAP, SEAT, type GridSeat, type SeatGrid } from '../lib/seatGrid';
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
    minWidth: PITCH * 8,
    bounds: { x: home.x - home.width, y: home.y - home.height, width: home.width * 3, height: home.height * 3 },
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
    const w = Math.min(home.width, PITCH * 26);
    animateTo({ x: mine.x - w / 2, y: mine.y - (w * aspect) / 2, width: w, height: w * aspect }, 600);
  }, [mine, aspect, animateTo, home.width]);

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
    if (!best || bd > Math.max(PITCH, pz.viewBox.width * 0.03)) return setPicked(null);
    setPicked({ row: best.row, n: best.n });
    onPickSeat?.(best.row, best.n);
  };

  const vb = pz.viewBox;
  const zoom = pz.scale;
  const pickedList = picked ? (bySeat.get(`${picked.row}|${picked.n}`) ?? []) : [];
  const hiRow = highlightRow ? grid.rows.find((r) => r.row === highlightRow) : undefined;
  // nomor kursi baru dibaca kalau kursi cukup besar di layar
  const showNumbers = vb.width < PITCH * 55;
  const labelSize = Math.min(ROW_GAP * 0.85, Math.max(6, vb.width / 45));

  return (
    <div className={cx('relative', className)}>
      <div className="relative overflow-hidden rounded-3xl bg-[#101a4d] ring-1 ring-white/10">
        <svg
          ref={pz.ref}
          viewBox={pz.viewBoxAttr}
          className={cx('block w-full touch-none select-none', svgClassName ?? 'h-80')}
          // tinggi mengikuti bentuk CAT (tidak ada ruang kosong besar di HP),
          // tapi tidak melebihi tinggi dari svgClassName
          style={{ aspectRatio: `${home.width} / ${home.height}`, height: 'auto', maxHeight: 'min(62vh, 560px)', minHeight: 180 }}
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
          {/* panggung */}
          {grid.stage.kind === 'bar' ? (
            <g pointerEvents="none">
              <rect
                x={grid.stage.x}
                y={grid.stage.y}
                width={grid.stage.width}
                height={grid.stage.height}
                rx={grid.stage.height / 2}
                fill="#e7ebf3"
              />
              <text
                x={grid.stage.x + grid.stage.width / 2}
                y={grid.stage.y + grid.stage.height * 0.7}
                textAnchor="middle"
                fontSize={grid.stage.height * 0.55}
                fontWeight={900}
                fill="#1a2350"
                letterSpacing={2}
              >
                PANGGUNG
              </text>
            </g>
          ) : (
            <g pointerEvents="none">
              <path d={grid.stage.d} fill="#e7ebf3" />
              <text
                x={grid.stage.label[0]}
                y={grid.stage.label[1] + ROW_GAP * 0.35}
                textAnchor="middle"
                fontSize={ROW_GAP * 0.95}
                fontWeight={900}
                fill="#1a2350"
                letterSpacing={2}
              >
                PANGGUNG
              </text>
            </g>
          )}

          {/* sorotan baris */}
          {hiRow?.path.map((line, i) => (
            <polyline
              key={i}
              points={line.map((p) => p.join(',')).join(' ')}
              fill="none"
              stroke="#ffc928"
              strokeOpacity={0.5}
              strokeWidth={SEAT * 1.6}
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
              return (
                <g key={`${s.row}|${s.n}`} transform={`translate(${s.x} ${s.y}) rotate(${s.angle})`}>
                  <rect
                    x={-SEAT / 2}
                    y={-SEAT / 2}
                    width={SEAT}
                    height={SEAT}
                    rx={SEAT * 0.25}
                    fill={empty ? info.color : SEAT_STATE_FILL[st]}
                    fillOpacity={empty ? 0.35 : 1}
                    stroke={isPicked ? '#ffc928' : isMine ? '#ffffff' : 'rgb(255 255 255 / .4)'}
                    strokeWidth={isPicked || isMine ? 1.6 : 0.6}
                  />
                  {/* sandaran: sisi yang menjauhi panggung */}
                  <rect
                    x={-SEAT / 2 + 0.6}
                    y={SEAT / 2 - SEAT * 0.24}
                    width={SEAT - 1.2}
                    height={SEAT * 0.18}
                    rx={SEAT * 0.08}
                    fill="rgb(0 0 0 / .28)"
                    pointerEvents="none"
                  />
                  {showNumbers && (
                    <text
                      y={SEAT * 0.1}
                      textAnchor="middle"
                      fontSize={s.n >= 100 ? SEAT * 0.4 : SEAT * 0.48}
                      fontWeight={800}
                      fill="#fff"
                      pointerEvents="none"
                    >
                      {s.n}
                    </text>
                  )}
                </g>
              );
            })}
          </g>

          {/* label baris di kiri & kanan */}
          <g pointerEvents="none" fontWeight={900} fontSize={labelSize}>
            {grid.rows.map((r) =>
              [r.left, r.right].map(([x, y], i) => (
                <text
                  key={`${r.row}${i}`}
                  x={x}
                  y={y + labelSize * 0.35}
                  textAnchor="middle"
                  fill={r.row === highlightRow ? '#ffc928' : '#cdd6f6'}
                >
                  {r.row}
                </text>
              )),
            )}
          </g>

          {/* nama blok di belakang baris terakhir */}
          {zoom < 2.5 && (
            <g pointerEvents="none">
              {grid.blocks.map((b) => (
                <text
                  key={b.name}
                  x={b.x}
                  y={b.y}
                  transform={`rotate(${b.angle} ${b.x} ${b.y})`}
                  textAnchor="middle"
                  fontSize={ROW_GAP * 0.8}
                  fontWeight={800}
                  fill="#8f9bd0"
                >
                  {b.name}
                </text>
              ))}
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
        Denah tampak atas (perkiraan) · panggung di atas · {layout.rows.length} baris · {layout.capacity} kursi
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
