/**
 * ============================================================
 *  HOTSPOT SEATMAP (koordinat di atas seatmap.jpg 1920x1080)
 * ============================================================
 * Dibuat otomatis oleh scripts/build-hotspots.mjs dari segmentasi
 * warna gambar, lalu dikoreksi manual. Koordinat masih PERKIRAAN.
 *
 * Mau merapikan? Buka /?editor=1 (dev saja), gambar ulang poligon,
 * klik "Export JSON", lalu tempel hasilnya ke ZONES di bawah.
 *
 * Format titik: "x,y x,y ..." (sama dengan atribut points di SVG).
 */

export const SEATMAP_SIZE = { width: 1920, height: 1080 } as const;

/**
 * Area peta saja (tanpa logo, teks tanggal, dan panel legenda di kanan).
 * Dipakai sebagai viewBox default.
 */
export const MAP_VIEWBOX = { x: 120, y: 180, width: 1140, height: 720 } as const;

export interface Zone {
  /** id unik, mis. "cat3-a" */
  id: string;
  category: number;
  points: string;
}

export const ZONES: Zone[] = [
  { id: 'cat1-a', category: 1, points: '840,332 892,372 870,386 820,346 838,334' },
  { id: 'cat1-b', category: 1, points: '974,438 1028,478 1002,490 954,452 972,440' },
  { id: 'cat2-a', category: 2, points: '808,280 814,282 818,302 816,346 868,386 872,408 800,442 748,436 706,442 660,460 650,454 634,434 632,422 726,372 690,342 686,320 806,282' },
  { id: 'cat2-b', category: 2, points: '948,452 1006,494 1102,508 1108,530 1020,598 1000,590 938,540 836,592 822,584 820,570 866,530 872,516 870,492 946,454' },
  { id: 'cat3-a', category: 3, points: '664,326 722,374 630,422 630,432 644,446 646,464 600,508 590,532 594,546 618,570 664,592 736,596 812,578 830,594 612,702 404,536 616,430 620,422 558,374 662,328' },
  { id: 'cat3-b', category: 3, points: '936,542 992,584 1002,608 904,662 902,648 836,594 934,544' },
  { id: 'cat4-a', category: 4, points: '1108,534 1218,564 1224,586 1140,652 1036,716 922,772 816,810 812,790 774,724 776,718 860,686 954,640 1044,584 1106,536' },
  { id: 'cat4-b', category: 4, points: '744,198 754,200 780,286 700,310 672,328 664,324 566,366 422,454 410,432 316,396 394,342 494,290 636,232 742,200' },
  { id: 'cat5-a', category: 5, points: '552,376 564,380 618,426 408,530 402,536 406,542 610,704 830,596 892,640 902,662 778,714 762,726 756,722 670,750 552,774 522,772 384,662 368,648 368,640 364,644 358,636 358,624 350,624 346,614 296,572 362,502 416,458 550,378' },
  { id: 'cat6-a', category: 6, points: '324,412 396,440 416,456 308,554 294,572 298,596 506,762 524,776 552,776 630,762 772,724 760,732 788,778 658,818 514,842 504,864 462,866 434,860 426,834 154,622 152,586 188,532 238,480 322,414' },
  { id: 'cat7-a', category: 7, points: '782,782 798,794 798,816 626,864 518,880 514,844 624,828 780,784' },
  { id: 'cat7-b', category: 7, points: '230,688 332,766 340,774 342,794 306,812 298,788 196,708 228,690' },
  { id: 'cat7-c', category: 7, points: '302,404 322,412 238,478 186,532 154,582 144,582 138,560 164,526 218,472 300,406' },
];

/** Label panggung (non-klik) */
export const STAGES = [
  { id: 'main', label: 'MAIN STAGE', x: 1058, y: 345, rotate: 35 },
  { id: 'island', label: 'ISLAND STAGE', x: 726, y: 512, rotate: 35 },
] as const;

/**
 * Siluet panggung (main + catwalk + island jadi satu bentuk), diekstrak
 * dari gambar. Dipakai di "mode bersih" supaya peta tetap terbaca tanpa
 * gambar resmi.
 */
export const STAGE_OUTLINE = '1062,232 1084,246 1086,266 1096,276 1198,356 1204,358 1218,352 1232,362 1240,386 1120,446 1120,470 1084,488 1080,468 1044,440 1040,458 1004,450 1000,448 996,428 960,412 960,434 866,480 862,484 864,494 848,502 850,522 840,544 820,564 778,586 734,594 666,590 658,586 652,570 632,560 618,546 612,520 622,496 646,472 674,456 730,440 802,444 816,438 824,444 928,392 930,388 912,360 906,332 872,304 906,286 928,300 1060,234';

export function zonesOf(category: number): Zone[] {
  return ZONES.filter((z) => z.category === category);
}

/** Bounding box gabungan semua poligon satu CAT */
export function categoryBBox(category: number): { x: number; y: number; width: number; height: number } | null {
  const pts = zonesOf(category).flatMap((z) => parsePoints(z.points));
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function parsePoints(points: string): [number, number][] {
  return points
    .trim()
    .split(/\s+/)
    .map((p) => p.split(',').map(Number) as [number, number]);
}

/** Titik tengah (rata-rata vertex) poligon terbesar CAT ini, buat pin/badge */
export function categoryAnchor(category: number): [number, number] | null {
  const zs = zonesOf(category);
  if (!zs.length) return null;
  const area = (pts: [number, number][]) =>
    Math.abs(pts.reduce((s, [x, y], i) => {
      const [nx, ny] = pts[(i + 1) % pts.length];
      return s + x * ny - nx * y;
    }, 0)) / 2;
  const biggest = zs.map((z) => parsePoints(z.points)).sort((a, b) => area(b) - area(a))[0];
  const cx = biggest.reduce((s, p) => s + p[0], 0) / biggest.length;
  const cy = biggest.reduce((s, p) => s + p[1], 0) / biggest.length;
  return [Math.round(cx), Math.round(cy)];
}
