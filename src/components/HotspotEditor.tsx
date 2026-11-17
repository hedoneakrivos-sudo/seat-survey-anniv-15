import { useEffect, useMemo, useRef, useState } from 'react';
import { SEATMAP_SIZE, ZONES, type Zone } from '../config/seatmapHotspots';
import { CAT_CONFIG, getCatInfo } from '../config/catConfig';
import { Button } from './ui';
import { CatChip } from './theme';

type Pt = [number, number];

/**
 * Editor hotspot (dev saja, buka /?editor=1).
 *
 * - Klik di gambar = tambah titik ke poligon yang sedang digambar
 * - Enter / tombol "Selesai" = tutup poligon (min. 3 titik)
 * - Backspace = hapus titik terakhir, Esc = batal
 * - Klik poligon lama = pilih, lalu hapus atau ganti CAT-nya
 * - Drag titik pada poligon terpilih = geser titik
 * - "Export JSON" = salin array ZONES siap tempel ke seatmapHotspots.ts
 */
export function HotspotEditor() {
  const [zones, setZones] = useState<Zone[]>(() => ZONES.map((z) => ({ ...z })));
  const [cat, setCat] = useState(1);
  const [draft, setDraft] = useState<Pt[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [showImage, setShowImage] = useState(true);
  const [copied, setCopied] = useState(false);
  const svg = useRef<SVGSVGElement>(null);

  const toPt = (e: { clientX: number; clientY: number }): Pt => {
    const m = svg.current!.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return [Math.round(p.x), Math.round(p.y)];
  };

  const parse = (s: string): Pt[] => s.trim().split(/\s+/).map((p) => p.split(',').map(Number) as Pt);
  const fmt = (pts: Pt[]) => pts.map((p) => p.join(',')).join(' ');

  const finish = () => {
    if (draft.length < 3) return;
    const n = zones.filter((z) => z.category === cat).length;
    const id = `cat${cat}-${String.fromCharCode(97 + n)}`;
    setZones((zs) => [...zs, { id, category: cat, points: fmt(draft) }]);
    setDraft([]);
    setSelectedId(id);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.key === 'Enter') finish();
      if (e.key === 'Escape') {
        setDraft([]);
        setSelectedId(null);
      }
      if (e.key === 'Backspace' && draft.length) {
        e.preventDefault();
        setDraft((d) => d.slice(0, -1));
      }
      if (e.key === 'Delete' && selectedId) removeSelected();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const selected = zones.find((z) => z.id === selectedId) ?? null;

  const removeSelected = () => {
    setZones((zs) => zs.filter((z) => z.id !== selectedId));
    setSelectedId(null);
  };

  const recategorize = (c: number) => {
    if (!selected) return setCat(c);
    setZones((zs) => zs.map((z) => (z.id === selected.id ? { ...z, category: c } : z)));
    setCat(c);
  };

  /** id dirapikan ulang per CAT: cat1-a, cat1-b, ... */
  const exportJson = useMemo(() => {
    const counters: Record<number, number> = {};
    const tidy = [...zones]
      .sort((a, b) => a.category - b.category)
      .map((z) => {
        const i = (counters[z.category] = (counters[z.category] ?? -1) + 1);
        return { id: `cat${z.category}-${String.fromCharCode(97 + i)}`, category: z.category, points: z.points };
      });
    return JSON.stringify(tidy, null, 2);
  }, [zones]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* textarea di bawah tetap bisa disalin manual */
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass rounded-4xl p-4">
        <h1 className="title-3d text-3xl">Mode Editor Hotspot</h1>
        <p className="mt-1 text-sm font-semibold text-ink-soft">
          Dev saja. Klik gambar untuk menambah titik · <kbd>Enter</kbd> selesai · <kbd>Backspace</kbd> hapus titik ·{' '}
          <kbd>Esc</kbd> batal · klik poligon untuk memilih · drag titik untuk menggeser · <kbd>Delete</kbd> hapus
          poligon.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-extrabold text-ink">CAT:</span>
          {CAT_CONFIG.map((c) => (
            <CatChip key={c.category} category={c.category} selected={cat === c.category} onClick={() => recategorize(c.category)} />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={finish} disabled={draft.length < 3}>
            Selesai ({draft.length} titik)
          </Button>
          <Button variant="secondary" onClick={() => setDraft([])} disabled={!draft.length}>
            Batal
          </Button>
          <Button variant="danger" onClick={removeSelected} disabled={!selected}>
            Hapus poligon
          </Button>
          <Button variant="secondary" onClick={() => setShowImage((v) => !v)}>
            {showImage ? 'Sembunyikan gambar' : 'Tampilkan gambar'}
          </Button>
          <Button onClick={copy}>{copied ? 'Tersalin!' : 'Export JSON'}</Button>
        </div>
        {selected && (
          <p className="mt-2 text-sm font-bold text-ink">
            Terpilih: <code>{selected.id}</code> ({getCatInfo(selected.category)?.name}, {parse(selected.points).length} titik)
          </p>
        )}
      </div>

      <div className="glass overflow-auto rounded-4xl p-2">
        <svg
          ref={svg}
          viewBox={`0 0 ${SEATMAP_SIZE.width} ${SEATMAP_SIZE.height}`}
          className="block w-full min-w-[900px] cursor-crosshair select-none"
          onClick={(e) => {
            if (dragIdx !== null) return;
            setSelectedId(null);
            setDraft((d) => [...d, toPt(e)]);
          }}
          onPointerMove={(e) => {
            if (dragIdx === null || !selected) return;
            const pts = parse(selected.points);
            pts[dragIdx] = toPt(e);
            setZones((zs) => zs.map((z) => (z.id === selected.id ? { ...z, points: fmt(pts) } : z)));
          }}
          onPointerUp={() => setTimeout(() => setDragIdx(null), 0)}
        >
          <rect width={SEATMAP_SIZE.width} height={SEATMAP_SIZE.height} fill="#8ed0f7" />
          {showImage && <image href="/assets/seatmap.jpg" width={SEATMAP_SIZE.width} height={SEATMAP_SIZE.height} />}

          {zones.map((z) => {
            const info = getCatInfo(z.category)!;
            const isSel = z.id === selectedId;
            return (
              <polygon
                key={z.id}
                points={z.points}
                fill={info.color}
                fillOpacity={isSel ? 0.55 : 0.3}
                stroke={isSel ? '#000' : '#1a0d00'}
                strokeWidth={isSel ? 4 : 2}
                onClick={(e) => {
                  e.stopPropagation();
                  if (draft.length) return;
                  setSelectedId(z.id);
                  setCat(z.category);
                }}
                className="cursor-pointer"
              />
            );
          })}

          {selected &&
            parse(selected.points).map(([x, y], i) => (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={8}
                fill="#fff"
                stroke="#000"
                strokeWidth={3}
                className="cursor-move"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                  setDragIdx(i);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ))}

          {draft.length > 0 && (
            <g pointerEvents="none">
              <polyline points={fmt(draft)} fill="none" stroke="#000" strokeWidth={3} strokeDasharray="10 6" />
              <polygon points={fmt(draft)} fill={getCatInfo(cat)!.color} fillOpacity={0.35} />
              {draft.map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r={6} fill={i === 0 ? '#ffc928' : '#fff'} stroke="#000" strokeWidth={2} />
              ))}
            </g>
          )}
        </svg>
      </div>

      <div className="glass rounded-4xl p-4">
        <label htmlFor="export" className="font-display text-lg text-ink">
          Export JSON ({zones.length} poligon)
        </label>
        <p className="text-sm text-ink-soft">
          Tempel ke <code>ZONES</code> di <code>src/config/seatmapHotspots.ts</code>.
        </p>
        <textarea
          id="export"
          readOnly
          value={exportJson}
          className="mt-2 h-56 w-full rounded-2xl border-2 border-white bg-white/90 p-3 font-mono text-xs text-slate-900"
        />
      </div>
    </div>
  );
}
