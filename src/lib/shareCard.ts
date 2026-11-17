import { CAT_CONFIG, EVENT, getCatInfo } from '../config/catConfig';
import { MAP_VIEWBOX, STAGE_OUTLINE, ZONES, parsePoints } from '../config/seatmapHotspots';
import { geometryOf } from '../components/CategorySeatMap';
import { getCategory } from './layout';
import type { PublicSeat } from './types';

export type ShareSize = 'story' | 'square';

const DIM: Record<ShareSize, { w: number; h: number }> = {
  story: { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 },
};

/**
 * Gambar share card ke canvas, lalu kembalikan Blob PNG.
 *
 * Semua digambar sendiri (tanpa gambar resmi) supaya hasilnya tidak
 * menyebarkan ulang aset penyelenggara: potongan peta memakai poligon
 * zona + titik kursi dari seatGeometry, plus pin di kursi user.
 */
export async function renderShareCard(seat: PublicSeat, size: ShareSize): Promise<Blob> {
  const { w, h } = DIM[size];
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const info = getCatInfo(seat.category)!;

  /* ---------- langit ---------- */
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#1e7ff0');
  sky.addColorStop(0.55, '#8ed0f7');
  sky.addColorStop(1, '#e6f5fd');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);

  // awan
  g.fillStyle = 'rgba(255,255,255,.75)';
  for (const [cx, cy, s] of [
    [w * 0.18, h * 0.1, 1],
    [w * 0.82, h * 0.16, 0.7],
    [w * 0.3, h * 0.88, 0.85],
  ] as const) {
    g.beginPath();
    g.ellipse(cx, cy, 130 * s, 52 * s, 0, 0, Math.PI * 2);
    g.ellipse(cx + 85 * s, cy - 18 * s, 95 * s, 60 * s, 0, 0, Math.PI * 2);
    g.ellipse(cx - 85 * s, cy + 8 * s, 85 * s, 44 * s, 0, 0, Math.PI * 2);
    g.fill();
  }

  /* ---------- judul ---------- */
  const titleY = size === 'story' ? 210 : 150;
  g.textAlign = 'center';
  g.font = `900 ${size === 'story' ? 112 : 96}px "Lilita One", system-ui, sans-serif`;
  g.lineJoin = 'round';
  g.lineWidth = size === 'story' ? 16 : 14;
  g.strokeStyle = '#5a3a00';
  g.strokeText(EVENT.title.toUpperCase(), w / 2, titleY);
  g.fillStyle = '#ffc928';
  g.fillText(EVENT.title.toUpperCase(), w / 2, titleY);

  g.font = `800 ${size === 'story' ? 36 : 32}px Nunito, system-ui, sans-serif`;
  g.fillStyle = '#ffffff';
  g.strokeStyle = 'rgba(0,0,0,.35)';
  g.lineWidth = 5;
  g.strokeText(EVENT.subtitle, w / 2, titleY + 58);
  g.fillText(EVENT.subtitle, w / 2, titleY + 58);

  /* ---------- peta ---------- */
  const mapTop = size === 'story' ? 330 : 240;
  const mapH = size === 'story' ? 760 : 520;
  const pad = 40;
  drawMap(g, seat, { x: pad, y: mapTop, w: w - pad * 2, h: mapH });

  /* ---------- kartu info ---------- */
  const cardY = mapTop + mapH + (size === 'story' ? 70 : 40);
  const cardH = size === 'story' ? 420 : 250;
  roundRect(g, pad, cardY, w - pad * 2, cardH, 56);
  g.fillStyle = 'rgba(255,255,255,.88)';
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = '#ffffff';
  g.stroke();

  // chip CAT
  const chipW = 220;
  const chipH = 76;
  roundRect(g, w / 2 - chipW / 2, cardY + 40, chipW, chipH, chipH / 2);
  g.fillStyle = info.color;
  g.fill();
  g.fillStyle = info.textColor;
  g.font = '900 46px "Lilita One", system-ui, sans-serif';
  g.fillText(`CAT ${seat.category}`, w / 2, cardY + 40 + chipH / 2 + 16);

  g.fillStyle = '#0f2747';
  g.font = `900 ${size === 'story' ? 60 : 50}px "Lilita One", system-ui, sans-serif`;
  g.fillText(`Row ${seat.row_label} · No. ${seat.seat_number}`, w / 2, cardY + 190);
  g.font = `800 ${size === 'story' ? 40 : 34}px Nunito, system-ui, sans-serif`;
  g.fillStyle = '#35506f';
  g.fillText(`Gate ${seat.gate} · ${seat.nickname}`, w / 2, cardY + 248);

  if (size === 'story') {
    g.font = '900 44px "Lilita One", system-ui, sans-serif';
    g.fillStyle = '#0f2747';
    g.fillText('Sebelahku siapa?', w / 2, cardY + 340);
    if (seat.want_swap) {
      const t = 'MAU TUKAR';
      g.font = '900 34px Nunito, system-ui, sans-serif';
      const tw = g.measureText(t).width + 56;
      roundRect(g, w / 2 - tw / 2, cardY + 364, tw, 56, 28);
      g.fillStyle = '#f97316';
      g.fill();
      g.fillStyle = '#fff';
      g.fillText(t, w / 2, cardY + 402);
    }
  }

  /* ---------- footer ---------- */
  g.font = `800 ${size === 'story' ? 32 : 26}px Silkscreen, monospace`;
  g.fillStyle = '#5a3a00';
  const fy = h - (size === 'story' ? 150 : 90);
  g.fillText(`${EVENT.venue.toUpperCase()} | ${EVENT.dateLabel.toUpperCase()}`, w / 2, fy);
  g.font = `700 ${size === 'story' ? 24 : 20}px Nunito, system-ui, sans-serif`;
  g.fillStyle = 'rgba(15,39,71,.75)';
  g.fillText('Fan project tidak resmi · Seat Survey', w / 2, fy + 42);

  return await new Promise<Blob>((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('CANVAS_EMPTY'))), 'image/png'),
  );
}

/** Peta mini: zona CAT + kursi + pin, digambar dari poligon (bukan gambar resmi) */
function drawMap(
  g: CanvasRenderingContext2D,
  seat: PublicSeat,
  box: { x: number; y: number; w: number; h: number },
) {
  const layout = getCategory(seat.category);
  const geom = layout ? geometryOf(layout) : null;
  const mine = geom?.seats.find((s) => s.row === seat.row_label && s.n === seat.seat_number);

  // fokus di sekitar kursi user, tapi tetap memperlihatkan konteks
  const focus = mine
    ? { x: mine.x - 300, y: mine.y - 190, w: 600, h: 380 }
    : { x: MAP_VIEWBOX.x, y: MAP_VIEWBOX.y, w: MAP_VIEWBOX.width, h: MAP_VIEWBOX.height };
  const scale = Math.min(box.w / focus.w, box.h / focus.h);
  const ox = box.x + (box.w - focus.w * scale) / 2 - focus.x * scale;
  const oy = box.y + (box.h - focus.h * scale) / 2 - focus.y * scale;
  const X = (x: number) => ox + x * scale;
  const Y = (y: number) => oy + y * scale;

  roundRect(g, box.x, box.y, box.w, box.h, 48);
  g.save();
  g.clip();
  g.fillStyle = '#bfe3fa';
  g.fillRect(box.x, box.y, box.w, box.h);

  // panggung
  const stage = parsePoints(STAGE_OUTLINE);
  path(g, stage, X, Y);
  g.fillStyle = '#eef1f5';
  g.fill();
  g.strokeStyle = '#b7c0cc';
  g.lineWidth = 2;
  g.stroke();

  // semua zona (CAT lain redup)
  for (const z of ZONES) {
    path(g, parsePoints(z.points), X, Y);
    const isMine = z.category === seat.category;
    g.fillStyle = getCatInfo(z.category)!.color;
    g.globalAlpha = isMine ? 0.85 : 0.3;
    g.fill();
    g.globalAlpha = 1;
    if (isMine) {
      g.strokeStyle = '#fff';
      g.lineWidth = 4;
      g.stroke();
    }
  }

  // kursi CAT ini
  if (geom) {
    for (const s of geom.seats) {
      const size = Math.max(2, s.r * scale);
      g.fillStyle = s === mine ? '#2563eb' : 'rgba(255,255,255,.72)';
      roundRect(g, X(s.x) - size / 2, Y(s.y) - size / 2, size, size, size * 0.3);
      g.fill();
    }
  }

  // pin smiley
  if (mine) drawPin(g, X(mine.x), Y(mine.y), Math.max(42, 70 * Math.min(1, scale)));

  g.restore();
  roundRect(g, box.x, box.y, box.w, box.h, 48);
  g.strokeStyle = 'rgba(255,255,255,.9)';
  g.lineWidth = 8;
  g.stroke();
}

function drawPin(g: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const s = size / 40;
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(-14, -22, -18, -30, -18, -40);
  g.arc(0, -40, 18, Math.PI, 0);
  g.bezierCurveTo(18, -30, 14, -22, 0, 0);
  g.closePath();
  g.fillStyle = '#ffc928';
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = '#5a3a00';
  g.stroke();
  g.fillStyle = '#5a3a00';
  for (const dx of [-6, 6]) {
    g.beginPath();
    g.arc(dx, -44, 2.8, 0, Math.PI * 2);
    g.fill();
  }
  g.beginPath();
  g.moveTo(-8, -37);
  g.quadraticCurveTo(0, -29, 8, -37);
  g.lineWidth = 3;
  g.stroke();
  g.restore();
}

function path(g: CanvasRenderingContext2D, pts: [number, number][], X: (n: number) => number, Y: (n: number) => number) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
  g.closePath();
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export const shareFileName = (seat: PublicSeat, size: ShareSize) =>
  `ayo-senyumlah-cat${seat.category}-row${seat.row_label}-${seat.seat_number}-${size === 'story' ? '1080x1920' : '1080x1080'}.png`;

/** Hanya untuk memastikan semua CAT punya konfigurasi saat render */
export const SHARE_CATS = CAT_CONFIG.map((c) => c.category);
