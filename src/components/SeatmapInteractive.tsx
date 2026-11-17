import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  MAP_VIEWBOX,
  SEATMAP_SIZE,
  STAGES,
  STAGE_OUTLINE,
  ZONES,
  categoryAnchor,
  categoryBBox,
  parsePoints,
} from '../config/seatmapHotspots';
import { CAT_CONFIG, formatFirstPrice, getCatInfo } from '../config/catConfig';
import { SEAT_LAYOUT } from '../config/seatLayout';
import { usePanZoom } from '../hooks/usePanZoom';
import { cx } from '../lib/cx';
import { CatChip } from './theme';

export type MapMode = 'image' | 'clean';

export interface CatStats {
  total: number;
  swap: number;
}

interface Props {
  selected: number | null;
  onSelect: (category: number) => void;
  /** jumlah pengisi per CAT (counter & heatmap) */
  stats?: Record<number, CatStats>;
  /** CAT milik user → pin smiley */
  myCategory?: number | null;
  mode?: MapMode;
  heatmap?: boolean;
  swapOnly?: boolean;
  /** tinggi peta, mis. "45vh" */
  className?: string;
}

/** skala heatmap: sepi → ramai */
const HEAT = ['#fde68a', '#fbbf24', '#f97316', '#ea580c', '#c2410c', '#7c2d12'];

/** Hotspot kecil tetap punya area sentuh ≥ 44px CSS (lihat TouchTarget) */
const MIN_TOUCH_PX = 44;

/**
 * <image> di SVG tidak mendukung srcset, jadi pilih manual:
 * layar kecil (lebar fisik ≤ 700px) → 570px webp (16KB), selebihnya 1140px.
 * Fallback JPEG untuk browser lama tanpa webp.
 */
export function pickImage(): string {
  if (typeof window === 'undefined') return '/assets/seatmap-map-1140.jpg';
  const c = document.createElement('canvas');
  const webp = c.toDataURL?.('image/webp').startsWith('data:image/webp');
  if (!webp) return '/assets/seatmap-map-1140.jpg';
  return window.innerWidth * (window.devicePixelRatio || 1) <= 700 ? '/assets/seatmap-map-570.webp' : '/assets/seatmap-map-1140.webp';
}

/**
 * Peta isometrik + overlay SVG hotspot.
 * - Gambar & overlay di satu SVG yang sama (viewBox 1920x1080),
 *   jadi koordinat konsisten di semua ukuran layar dan ikut pan/zoom.
 * - Setiap CAT = satu <g role="button"> berisi semua poligonnya,
 *   jadi semua potongan menyala bersamaan & cukup satu tab stop.
 */
export function SeatmapInteractive({
  selected,
  onSelect,
  stats = {},
  myCategory,
  mode = 'image',
  heatmap = false,
  swapOnly = false,
  className,
}: Props) {
  const pz = usePanZoom<SVGSVGElement>({
    home: MAP_VIEWBOX,
    minWidth: 220,
    // geser dibatasi ke area peta (gambar crop), bukan seluruh poster
    bounds: MAP_VIEWBOX,
  });
  const [hover, setHover] = useState<{ cat: number; x: number; y: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const filterId = useId().replace(/:/g, '');
  const [pxPerUnit, setPxPerUnit] = useState(1);
  const [imageSrc] = useState(pickImage);

  // ukuran 1 unit SVG dalam px layar, untuk area sentuh minimum
  useEffect(() => {
    const el = pz.ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPxPerUnit(el.getBoundingClientRect().width / pz.viewBox.width));
    ro.observe(el);
    setPxPerUnit(el.getBoundingClientRect().width / pz.viewBox.width);
    return () => ro.disconnect();
  }, [pz.ref, pz.viewBox.width]);

  // zoom halus ke CAT terpilih
  const lastSelected = useRef<number | null>(null);
  useEffect(() => {
    if (selected === lastSelected.current) return;
    lastSelected.current = selected;
    if (!selected) return;
    const bb = categoryBBox(selected);
    if (!bb) return;
    // beri ruang 35% di sekeliling zona; animateTo yang menyesuaikan rasio
    const pad = 0.35;
    const width = Math.max(bb.width * (1 + pad * 2), 300);
    const height = Math.max(bb.height * (1 + pad * 2), 190);
    pz.animateTo({ x: bb.x + bb.width / 2 - width / 2, y: bb.y + bb.height / 2 - height / 2, width, height });
  }, [selected, pz]);

  const byCat = useMemo(() => {
    const m = new Map<number, typeof ZONES>();
    for (const z of ZONES) m.set(z.category, [...(m.get(z.category) ?? []), z]);
    return m;
  }, []);

  /**
   * Heatmap = keterisian relatif terhadap kapasitas CAT (bukan jumlah mentah,
   * supaya CAT kecil seperti CAT 1 tidak selalu tampak sepi).
   * Skala oranye → merah gelap, dari 10% ke 95% opasitas.
   */
  const fillFor = (cat: number) => {
    const info = getCatInfo(cat)!;
    if (!heatmap) return { fill: info.color, opacity: mode === 'clean' ? 1 : 0 };
    const cap = SEAT_LAYOUT.find((l) => l.category === cat)?.capacity ?? 1;
    const rates = CAT_CONFIG.map((c) => (stats[c.category]?.total ?? 0) / (SEAT_LAYOUT.find((l) => l.category === c.category)?.capacity ?? 1));
    const maxRate = Math.max(1e-6, ...rates);
    const t = (stats[cat]?.total ?? 0) / cap / maxRate;
    return { fill: HEAT[Math.min(HEAT.length - 1, Math.floor(t * HEAT.length))], opacity: 0.1 + 0.85 * t };
  };

  const select = (cat: number) => {
    setHover(null);
    onSelect(cat);
  };

  const onKey = (e: KeyboardEvent, cat: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      select(cat);
    }
  };

  const tooltipFor = (cat: number) => {
    const info = getCatInfo(cat)!;
    const n = stats[cat]?.total ?? 0;
    return `${info.name} - ${formatFirstPrice(info)} - ${n} orang sudah isi`;
  };

  const ariaFor = (cat: number) => {
    const s = stats[cat];
    return `${tooltipFor(cat)}${s?.swap ? `, ${s.swap} mau tukar` : ''}. Tekan Enter untuk memilih.`;
  };

  const pin = myCategory ? categoryAnchor(myCategory) : null;
  /**
   * 1 px layar dalam unit SVG. Dipakai agar garis, pin, dan badge tetap
   * setebal/sebesar itu di layar walau peta di-zoom.
   * Dibatasi supaya di layar sempit elemennya tidak membesar berlebihan.
   */
  const unit = Math.min(1 / pxPerUnit, 1.6);

  return (
    <div ref={wrap} className={cx('relative isolate overflow-hidden rounded-4xl', className)}>
      <svg
        ref={pz.ref}
        viewBox={pz.viewBoxAttr}
        className="block h-full w-full touch-none select-none"
        role="group"
        aria-label="Denah venue. Geser untuk melihat, cubit atau scroll dengan Ctrl untuk zoom."
        {...pz.handlers}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <filter id={`glow-${filterId}`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="10" stdDeviation="9" floodColor="#0b2a5a" floodOpacity="0.45" />
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#fff" floodOpacity="0.9" />
          </filter>
        </defs>

        {/* langit: selalu menutupi seluruh bounds, termasuk saat viewBox meluber */}
        <rect x={-200} y={-200} width={SEATMAP_SIZE.width + 400} height={SEATMAP_SIZE.height + 400} fill="var(--sky-b)" />

        {mode === 'image' ? (
          <image
            href={imageSrc}
            x={MAP_VIEWBOX.x}
            y={MAP_VIEWBOX.y}
            width={MAP_VIEWBOX.width}
            height={MAP_VIEWBOX.height}
            preserveAspectRatio="none"
            aria-hidden
          />
        ) : (
          <g aria-hidden>
            <polygon points={STAGE_OUTLINE} fill="#eef1f5" stroke="#b7c0cc" strokeWidth={3} />
          </g>
        )}

        {/* label panggung (non-klik) */}
        {mode === 'clean' &&
          STAGES.map((s) => (
            <text
              key={s.id}
              x={s.x}
              y={s.y}
              transform={`rotate(${s.rotate} ${s.x} ${s.y})`}
              textAnchor="middle"
              fontSize={22}
              fontWeight={900}
              fill="#1a1a1a"
              style={{ fontFamily: 'var(--font-sans)', pointerEvents: 'none' }}
              aria-hidden
            >
              {s.label}
            </text>
          ))}

        {/* hotspot per CAT */}
        {CAT_CONFIG.map((info) => {
          const cat = info.category;
          const zones = byCat.get(cat) ?? [];
          const isSel = selected === cat;
          const isHover = hover?.cat === cat;
          const noSwap = swapOnly && !(stats[cat]?.swap ?? 0);
          const dim = (selected && !isSel && !isHover) || noSwap;
          const { fill, opacity } = fillFor(cat);
          const lifted = isSel || isHover;
          return (
            <g
              key={cat}
              role="button"
              tabIndex={0}
              aria-label={ariaFor(cat)}
              aria-pressed={isSel}
              data-cat={cat}
              className="cursor-pointer outline-none [&:focus-visible>.focus-outline]:opacity-100"
              style={{
                transform: lifted ? `translateY(${-5 * unit}px)` : undefined,
                transition: 'transform 200ms ease, opacity 200ms ease',
                opacity: dim ? 0.35 : 1,
                filter: lifted ? `url(#glow-${filterId})` : undefined,
              }}
              onKeyDown={(e) => onKey(e, cat)}
              onFocus={() => {
                const a = categoryAnchor(cat);
                if (a) setHover({ cat, x: a[0], y: a[1] });
              }}
              onBlur={() => setHover(null)}
              onPointerEnter={(e) => e.pointerType === 'mouse' && setHover({ cat, ...svgPoint(pz.ref.current, e) })}
              onPointerMove={(e) => e.pointerType === 'mouse' && setHover({ cat, ...svgPoint(pz.ref.current, e) })}
              onPointerLeave={() => setHover((h) => (h?.cat === cat ? null : h))}
              onClick={() => {
                if (pz.didDrag()) return;
                select(cat);
              }}
            >
              {zones.map((z) => (
                <polygon
                  key={z.id}
                  points={z.points}
                  // di atas gambar, poligon transparan; "redup" = lapisan gelap
                  fill={noSwap && !heatmap ? '#0b1440' : fill}
                  fillOpacity={
                    noSwap && !heatmap ? 0.55 : heatmap || mode === 'clean' ? opacity : lifted ? 0.28 : 0
                  }
                  stroke={lifted ? '#fff' : mode === 'clean' ? 'rgb(0 0 0 / .25)' : 'transparent'}
                  strokeWidth={(lifted ? 4 : 1.5) * unit}
                  strokeLinejoin="round"
                />
              ))}
              {/* outline fokus keyboard */}
              <g className="focus-outline opacity-0 transition-opacity" aria-hidden>
                {zones.map((z) => (
                  <polygon
                    key={`f-${z.id}`}
                    points={z.points}
                    fill="none"
                    stroke="#5a3a00"
                    strokeWidth={5 * unit}
                    strokeDasharray={`${10 * unit} ${6 * unit}`}
                  />
                ))}
              </g>
            </g>
          );
        })}

        {/*
          Area sentuh tambahan untuk zona kecil (CAT 1, CAT 7), digambar
          di atas semua zona supaya tidak tertutup poligon besar di sebelahnya.
          Bukan tab stop sendiri: keyboard tetap lewat <g role="button"> di atas.
        */}
        <g aria-hidden>
          {ZONES.map((z) => (
            <TouchTarget
              key={`t-${z.id}`}
              points={z.points}
              minUnits={MIN_TOUCH_PX * unit}
              onActivate={() => {
                if (pz.didDrag()) return;
                select(z.category);
              }}
            />
          ))}
        </g>

        {/* badge berdenyut: zona yang punya orang MAU TUKAR */}
        {swapOnly &&
          CAT_CONFIG.filter((c) => (stats[c.category]?.swap ?? 0) > 0).map((c) => {
            const a = categoryAnchor(c.category);
            if (!a) return null;
            const r = 14 * unit;
            return (
              <g
                key={`swap-${c.category}`}
                transform={`translate(${a[0] + (c.category === myCategory ? 34 * unit : 0)} ${a[1]})`}
                pointerEvents="none"
                aria-hidden
              >
                <circle r={r} fill="#f97316" className="origin-center animate-pulse-ring" style={{ transformBox: 'fill-box' }} />
                <circle r={r} fill="#f97316" stroke="#fff" strokeWidth={3 * unit} />
                <text y={5 * unit} textAnchor="middle" fontSize={14 * unit} fontWeight={900} fill="#fff">
                  {stats[c.category]!.swap}
                </text>
              </g>
            );
          })}

        {/* pin smiley seat saya */}
        {pin && <SmilePin x={pin[0]} y={pin[1]} unit={unit} />}
      </svg>

      {/* tooltip desktop */}
      {hover && (
        <Tooltip
          text={tooltipFor(hover.cat)}
          swap={stats[hover.cat]?.swap ?? 0}
          left={((hover.x - pz.viewBox.x) / pz.viewBox.width) * 100}
          top={((hover.y - pz.viewBox.y) / pz.viewBox.height) * 100}
        />
      )}

      {/* kontrol zoom */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
        <MapButton label="Perbesar" onClick={() => pz.zoomBy(1.6, undefined, true)}>
          +
        </MapButton>
        <MapButton label="Perkecil" onClick={() => pz.zoomBy(1 / 1.6, undefined, true)}>
          −
        </MapButton>
        <MapButton label="Lihat seluruh denah" onClick={pz.reset} disabled={pz.scale < 1.02}>
          ⤢
        </MapButton>
      </div>
    </div>
  );
}

function svgPoint(svg: SVGSVGElement | null, e: { clientX: number; clientY: number }) {
  if (!svg) return { x: 0, y: 0 };
  const m = svg.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}

/**
 * Lingkaran transparan di tengah poligon kecil supaya area tap ≥ 44px.
 * Hanya dirender kalau poligonnya sendiri lebih kecil dari itu.
 */
function TouchTarget({ points, minUnits, onActivate }: { points: string; minUnits: number; onActivate: () => void }) {
  const pts = parsePoints(points);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  if (Math.min(w, h) >= minUnits) return null;
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  return <circle cx={cx} cy={cy} r={minUnits / 2} fill="transparent" className="cursor-pointer" onClick={onActivate} />;
}

function SmilePin({ x, y, unit }: { x: number; y: number; unit: number }) {
  const s = 0.95 * unit;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} pointerEvents="none" aria-label="Seat kamu di sini" role="img">
      <path d="M0 0 C-14 -22 -18 -30 -18 -40 A18 18 0 1 1 18 -40 C18 -30 14 -22 0 0Z" fill="#ffc928" stroke="#5a3a00" strokeWidth={3} />
      <circle cx={-6} cy={-44} r={2.6} fill="#5a3a00" />
      <circle cx={6} cy={-44} r={2.6} fill="#5a3a00" />
      <path d="M-8 -37 Q0 -29 8 -37" fill="none" stroke="#5a3a00" strokeWidth={3} strokeLinecap="round" />
    </g>
  );
}

function Tooltip({ text, swap, left, top }: { text: string; swap: number; left: number; top: number }) {
  // jangan keluar dari sisi peta
  const l = Math.min(85, Math.max(15, left));
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 hidden -translate-x-1/2 -translate-y-[calc(100%+14px)] animate-pop-in rounded-2xl border-2 border-white bg-white/95 px-3 py-2 text-sm font-bold text-[#0f2747] shadow-lift md:block dark:border-white/15 dark:bg-[#141b4a]/95 dark:text-white"
      style={{ left: `${l}%`, top: `${Math.max(12, top)}%` }}
    >
      {text}
      {swap > 0 && <span className="ml-1 text-orange-600 dark:text-orange-300">· {swap} MAU TUKAR</span>}
    </div>
  );
}

function MapButton({
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
      className="focus-ring grid h-11 w-11 place-items-center rounded-full border-2 border-white bg-white/90 text-xl font-black text-[#0f2747] shadow-glass transition hover:bg-white disabled:opacity-40 dark:border-white/15 dark:bg-[#141b4a]/90 dark:text-white"
    >
      {children}
    </button>
  );
}

/** Chip CAT 1-7 horizontal: alternatif tap untuk zona kecil */
export function CatChipBar({
  selected,
  onSelect,
  stats = {},
}: {
  selected: number | null;
  onSelect: (c: number) => void;
  stats?: Record<number, CatStats>;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Pilih kategori"
      className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 pt-1 [scrollbar-width:none]"
    >
      {CAT_CONFIG.map((c) => (
        <CatChip
          key={c.category}
          category={c.category}
          selected={selected === c.category}
          count={stats[c.category]?.total}
          onClick={() => onSelect(c.category)}
          className="snap-start"
        />
      ))}
    </div>
  );
}
