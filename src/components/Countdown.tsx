import { useEffect, useState } from 'react';
import { EVENT } from '../config/catConfig';
import { countdownLabel, daysUntil } from '../lib/countdown';

/** Hitung ulang tiap jam; cukup karena satuannya hari. */
export function Countdown({ className }: { className?: string }) {
  const [days, setDays] = useState(() => daysUntil(EVENT.date, new Date(), EVENT.timeZone));

  useEffect(() => {
    const t = setInterval(() => setDays(daysUntil(EVENT.date, new Date(), EVENT.timeZone)), 3_600_000);
    return () => clearInterval(t);
  }, []);

  return <span className={className}>{days > 0 ? `H-${days}` : countdownLabel(days, EVENT.title)}</span>;
}
