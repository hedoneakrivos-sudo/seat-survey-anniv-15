import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Options {
  /** area yang harus terlihat utuh saat "home" (zoom out penuh) */
  home: ViewBox;
  /** lebar viewBox terkecil (zoom in maksimal) */
  minWidth: number;
  /** batas geser, biasanya ukuran gambar penuh */
  bounds: ViewBox;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Perluas `box` supaya rasio aspeknya = `aspect` (h/w), tetap di tengah */
function containAspect(box: ViewBox, aspect: number): ViewBox {
  if (box.height / box.width > aspect) {
    const width = box.height / aspect;
    return { x: box.x - (width - box.width) / 2, y: box.y, width, height: box.height };
  }
  const height = box.width * aspect;
  return { x: box.x, y: box.y - (height - box.height) / 2, width: box.width, height };
}

/**
 * Pan & zoom untuk SVG berbasis viewBox (bukan CSS transform), jadi
 * koordinat hotspot tetap di ruang 1920x1080 apa pun ukuran layarnya.
 *
 * Rasio aspek viewBox selalu mengikuti ukuran elemen, jadi 1 unit SVG
 * sama lebar dan tingginya di layar (tidak ada letterbox) dan konversi
 * layar → SVG cukup linear.
 *
 * - wheel (+Ctrl, atau bebas saat sudah zoom) / pinch: zoom ke titik kursor/jari
 * - drag 1 jari / mouse: geser
 * - double-tap / double-click: zoom in 2x
 * - animateTo(): transisi halus
 */
export function usePanZoom<T extends SVGSVGElement>({ home, minWidth, bounds }: Options) {
  const ref = useRef<T>(null);
  const [aspect, setAspect] = useState(home.height / home.width);
  const homeFit = containAspect(home, aspect);
  const homeRef = useRef(homeFit);
  homeRef.current = homeFit;

  const [vb, setVb] = useState<ViewBox>(homeFit);
  const vbRef = useRef(vb);
  vbRef.current = vb;
  const aspectRef = useRef(aspect);
  aspectRef.current = aspect;

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startVb: ViewBox; startDist: number; startMid: { x: number; y: number } } | null>(null);
  const dragged = useRef(false);
  const downAt = useRef({ x: 0, y: 0 });
  const lastTap = useRef({ t: 0, x: 0, y: 0 });
  const anim = useRef<number>();

  /** Paksa viewBox mengikuti rasio & tetap di dalam batas */
  const fit = useCallback(
    (v: ViewBox): ViewBox => {
      const a = aspectRef.current;
      const maxW = homeRef.current.width;
      const width = clamp(v.width, Math.min(minWidth, maxW), maxW);
      const height = width * a;
      // kalau viewBox lebih besar dari batas (layar sangat tinggi/lebar), taruh di tengah
      const x =
        width >= bounds.width ? bounds.x + (bounds.width - width) / 2 : clamp(v.x, bounds.x, bounds.x + bounds.width - width);
      const y =
        height >= bounds.height
          ? bounds.y + (bounds.height - height) / 2
          : clamp(v.y, bounds.y, bounds.y + bounds.height - height);
      return { x, y, width, height };
    },
    [minWidth, bounds],
  );

  // ikuti ukuran elemen; skala zoom saat ini dipertahankan
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const a = r.height / r.width;
      if (Math.abs(a - aspectRef.current) < 1e-3) return;
      const prevHome = homeRef.current;
      const cur = vbRef.current;
      const zoom = prevHome.width / cur.width;
      const cx = cur.x + cur.width / 2;
      const cy = cur.y + cur.height / 2;
      aspectRef.current = a;
      const nextHome = containAspect(home, a);
      homeRef.current = nextHome;
      setAspect(a);
      const width = nextHome.width / zoom;
      setVb(fit({ x: cx - width / 2, y: cy - (width * a) / 2, width, height: width * a }));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [home, fit]);

  /** layar (clientX/Y) → koordinat SVG */
  const toSvg = useCallback((clientX: number, clientY: number, v = vbRef.current) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: v.x + ((clientX - r.left) / r.width) * v.width, y: v.y + ((clientY - r.top) / r.height) * v.height };
  }, []);

  const stopAnim = () => {
    if (anim.current) cancelAnimationFrame(anim.current);
  };

  const animateTo = useCallback(
    (target: ViewBox, ms = 450) => {
      stopAnim();
      // pastikan seluruh target terlihat pada rasio layar sekarang
      const to = fit(containAspect(target, aspectRef.current));
      if (reduced() || ms <= 0) return setVb(to);
      const from = vbRef.current;
      const t0 = performance.now();
      const ease = (t: number) => 1 - Math.pow(1 - t, 3);
      const step = (now: number) => {
        const k = ease(Math.min(1, (now - t0) / ms));
        setVb({
          x: from.x + (to.x - from.x) * k,
          y: from.y + (to.y - from.y) * k,
          width: from.width + (to.width - from.width) * k,
          height: from.height + (to.height - from.height) * k,
        });
        if (k < 1) anim.current = requestAnimationFrame(step);
      };
      anim.current = requestAnimationFrame(step);
    },
    [fit],
  );

  /** Zoom dengan faktor tertentu; titik `at` (koordinat SVG) tetap diam */
  const zoomBy = useCallback(
    (factor: number, at?: { x: number; y: number }, animate = false) => {
      const v = vbRef.current;
      const p = at ?? { x: v.x + v.width / 2, y: v.y + v.height / 2 };
      const width = clamp(v.width / factor, Math.min(minWidth, homeRef.current.width), homeRef.current.width);
      const k = width / v.width;
      const next = fit({ x: p.x - (p.x - v.x) * k, y: p.y - (p.y - v.y) * k, width, height: width * aspectRef.current });
      if (animate) {
        stopAnim();
        const from = v;
        const t0 = performance.now();
        if (reduced()) return setVb(next);
        const step = (now: number) => {
          const t = Math.min(1, (now - t0) / 220);
          const e = 1 - Math.pow(1 - t, 3);
          setVb({
            x: from.x + (next.x - from.x) * e,
            y: from.y + (next.y - from.y) * e,
            width: from.width + (next.width - from.width) * e,
            height: from.height + (next.height - from.height) * e,
          });
          if (t < 1) anim.current = requestAnimationFrame(step);
        };
        anim.current = requestAnimationFrame(step);
      } else setVb(next);
    },
    [fit, minWidth],
  );

  const reset = useCallback(() => animateTo(homeRef.current), [animateTo]);

  // wheel harus non-passive supaya bisa preventDefault
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // tanpa Ctrl: biarkan halaman scroll, kecuali peta sudah di-zoom
      const zoomed = vbRef.current.width < homeRef.current.width - 1;
      if (!e.ctrlKey && !e.metaKey && !zoomed) return;
      e.preventDefault();
      stopAnim();
      zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025)), toSvg(e.clientX, e.clientY));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomBy, toSvg]);

  useEffect(() => () => stopAnim(), []);

  const startGesture = () => {
    const pts = [...pointers.current.values()];
    const mid = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    gesture.current = { startVb: vbRef.current, startDist: dist, startMid: mid };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    stopAnim();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      dragged.current = false;
      downAt.current = { x: e.clientX, y: e.clientY };
    } else {
      // jari kedua = pinch, bukan tap
      dragged.current = true;
    }
    startGesture();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!dragged.current && Math.hypot(e.clientX - downAt.current.x, e.clientY - downAt.current.y) < 6) return;
    if (!dragged.current) {
      dragged.current = true;
      // capture diambil setelah benar-benar menggeser, supaya klik hotspot tetap sampai ke poligonnya
      ref.current?.setPointerCapture(e.pointerId);
    }

    const pts = [...pointers.current.values()];
    const g = gesture.current;
    const r = ref.current!.getBoundingClientRect();
    const mid = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });
    let width = g.startVb.width;
    if (pts.length > 1 && g.startDist > 0) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      width = clamp(g.startVb.width * (g.startDist / dist), Math.min(minWidth, homeRef.current.width), homeRef.current.width);
    }
    // titik SVG di bawah titik-tengah awal tetap di bawah titik-tengah sekarang
    const anchorX = g.startVb.x + ((g.startMid.x - r.left) / r.width) * g.startVb.width;
    const anchorY = g.startVb.y + ((g.startMid.y - r.top) / r.height) * g.startVb.height;
    const height = width * aspectRef.current;
    setVb(
      fit({
        x: anchorX - ((mid.x - r.left) / r.width) * width,
        y: anchorY - ((mid.y - r.top) / r.height) * height,
        width,
        height,
      }),
    );
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const wasDown = pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) {
      startGesture();
      return;
    }
    gesture.current = null;
    if (!wasDown || dragged.current) return;
    // double-tap (sentuh) → zoom in. Mouse pakai onDoubleClick.
    if (e.pointerType === 'touch') {
      const now = performance.now();
      const near = Math.hypot(e.clientX - lastTap.current.x, e.clientY - lastTap.current.y) < 30;
      if (now - lastTap.current.t < 300 && near) {
        zoomBy(2, toSvg(e.clientX, e.clientY), true);
        lastTap.current.t = 0;
      } else {
        lastTap.current = { t: now, x: e.clientX, y: e.clientY };
      }
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => zoomBy(2, toSvg(e.clientX, e.clientY), true);

  return {
    ref,
    viewBox: vb,
    viewBoxAttr: `${vb.x} ${vb.y} ${vb.width} ${vb.height}`,
    aspect,
    /** 1 = home, 2 = zoom 2x */
    scale: homeFit.width / vb.width,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onDoubleClick,
    },
    didDrag: () => dragged.current,
    animateTo,
    zoomBy,
    reset,
  };
}
