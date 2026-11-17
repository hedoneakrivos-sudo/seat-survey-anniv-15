import { useEffect, useRef } from 'react';

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  kind: number;
}

const COLORS = ['#ffc928', '#f5a800', '#ff56af', '#3b8bea', '#57bc3c', '#ff1e26'];

/**
 * Konfeti smiley sekali jalan (~2.2s), lalu canvas dilepas.
 * Tidak jalan kalau prefers-reduced-motion aktif.
 */
export function SmileConfetti({ run }: { run: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!run) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = ref.current;
    if (!canvas) return;
    const g = canvas.getContext('2d');
    if (!g) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
    };
    resize();

    const n = window.innerWidth < 480 ? 70 : 120;
    const pieces: Piece[] = Array.from({ length: n }, (_, i) => ({
      x: Math.random() * canvas.width,
      y: -Math.random() * canvas.height * 0.4,
      vx: (Math.random() - 0.5) * 2.2 * dpr,
      vy: (1.6 + Math.random() * 2.4) * dpr,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.22,
      size: (9 + Math.random() * 13) * dpr,
      // 1 dari 3 berbentuk smiley, sisanya kepingan warna
      kind: i % 3 === 0 ? 0 : 1 + (i % COLORS.length),
    }));

    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      const t = now - t0;
      g.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of pieces) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.045 * dpr;
        p.rot += p.vr;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.globalAlpha = Math.max(0, 1 - t / 2200);
        if (p.kind === 0) {
          const r = p.size / 2;
          g.beginPath();
          g.arc(0, 0, r, 0, Math.PI * 2);
          g.fillStyle = '#ffc928';
          g.fill();
          g.lineWidth = Math.max(1, r * 0.18);
          g.strokeStyle = '#5a3a00';
          g.stroke();
          g.fillStyle = '#5a3a00';
          for (const dx of [-r * 0.35, r * 0.35]) {
            g.beginPath();
            g.arc(dx, -r * 0.18, r * 0.13, 0, Math.PI * 2);
            g.fill();
          }
          g.beginPath();
          g.arc(0, r * 0.05, r * 0.5, 0.25 * Math.PI, 0.75 * Math.PI);
          g.stroke();
        } else {
          g.fillStyle = COLORS[(p.kind - 1) % COLORS.length];
          g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        }
        g.restore();
      }
      if (t < 2200) raf = requestAnimationFrame(frame);
      else g.clearRect(0, 0, canvas.width, canvas.height);
    };
    raf = requestAnimationFrame(frame);
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [run]);

  if (!run) return null;
  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-40 h-dvh w-screen"
      style={{ width: '100vw', height: '100dvh' }}
    />
  );
}
