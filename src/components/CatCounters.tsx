import { CAT_CONFIG, getCatInfo } from '../config/catConfig';
import { SEAT_LAYOUT } from '../config/seatLayout';
import { useCountUp } from '../hooks/useCountUp';
import { cx } from '../lib/cx';
import type { CatStats } from './SeatmapInteractive';

interface Props {
  stats: Record<number, CatStats>;
  selected: number | null;
  onSelect: (cat: number) => void;
  loading?: boolean;
}

/**
 * Counter live per CAT: "CAT 3: 128 orang | 17 MAU TUKAR".
 * Angka naik dengan animasi saat data realtime berubah.
 */
export function CatCounters({ stats, selected, onSelect, loading }: Props) {
  return (
    <ul
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]"
      aria-label="Jumlah pengisi per kategori"
      aria-busy={loading || undefined}
    >
      {CAT_CONFIG.map((c) => (
        <li key={c.category}>
          <CounterChip
            category={c.category}
            total={stats[c.category]?.total ?? 0}
            swap={stats[c.category]?.swap ?? 0}
            selected={selected === c.category}
            onClick={() => onSelect(c.category)}
          />
        </li>
      ))}
    </ul>
  );
}

function CounterChip({
  category,
  total,
  swap,
  selected,
  onClick,
}: {
  category: number;
  total: number;
  swap: number;
  selected: boolean;
  onClick: () => void;
}) {
  const info = getCatInfo(category)!;
  const cap = SEAT_LAYOUT.find((l) => l.category === category)?.capacity ?? 0;
  const shownTotal = useCountUp(total);
  const shownSwap = useCountUp(swap);
  const pct = cap ? Math.min(100, Math.round((total / cap) * 100)) : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        'focus-ring relative flex min-h-16 w-36 shrink-0 flex-col justify-between rounded-3xl border-2 bg-white/80 px-3 py-2 text-left transition dark:bg-white/10',
        selected ? 'border-gold-ink dark:border-gold-400' : 'border-white dark:border-white/15',
      )}
    >
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/15" style={{ background: info.color }} aria-hidden />
        <span className="font-display text-sm text-ink">CAT {category}</span>
      </span>
      <span className="flex items-baseline gap-1">
        <span className="font-display text-xl tabular-nums text-ink">{shownTotal}</span>
        <span className="text-[11px] font-bold text-ink-soft">orang</span>
        {swap > 0 && (
          <span className="ml-auto text-[11px] font-extrabold tabular-nums text-orange-600 dark:text-orange-300">
            {shownSwap} tukar
          </span>
        )}
      </span>
      {/* bar kapasitas: estimasi, jadi tanpa angka persen yang menyesatkan */}
      <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/15" aria-hidden>
        <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: info.color }} />
      </span>
      <span className="sr-only">
        {total} orang sudah isi dari estimasi {cap} kursi{swap > 0 ? `, ${swap} mau tukar` : ''}
      </span>
    </button>
  );
}
