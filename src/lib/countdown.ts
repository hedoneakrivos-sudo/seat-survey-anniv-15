/** Hitung hari menuju acara, pakai tanggal kalender di zona waktu venue. */

/** "YYYY-MM-DD" untuk `now` di zona waktu tertentu */
export function dateInZone(now: Date, timeZone: string): string {
  // en-CA menghasilkan format ISO YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Selisih hari kalender (target − hari ini). 0 = hari H, negatif = sudah lewat. */
export function daysUntil(target: string, now: Date, timeZone: string): number {
  const today = dateInZone(now, timeZone);
  const toUtc = (d: string) => {
    const [y, m, day] = d.split('-').map(Number);
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((toUtc(target) - toUtc(today)) / 86_400_000);
}

export function countdownLabel(days: number, title: string): string {
  if (days > 0) return `H-${days} menuju ${title}`;
  if (days === 0) return `Hari H! ${title} 🎉`;
  return 'Makasih udah senyum bareng 💛';
}
