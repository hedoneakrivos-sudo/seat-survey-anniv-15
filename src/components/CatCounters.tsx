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
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
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
        'focus-ring relative flex w-32 shrink-0 flex-col gap-2 rounded-2xl border px-3 py-2.5 text-left transition-[background-color,border-color,transform] duration-150',
        selected
          ? 'border-gold-400 bg-[var(--surface-2)] shadow-[0_6px_18px_-8px_rgb(232_168_0_/_0.6)]'
          : 'border-[var(--chip-border)] bg-[var(--chip)] hover:-translate-y-0.5 hover:bg-[var(--surface-2)]',
      )}
    >
      <span className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-[var(--surface-2)]" style={{ background: info.color }} aria-hidden />
        <span className="whitespace-nowrap text-xs font-medium text-ink-soft">CAT {category}</span>
        {swap > 0 && (
          <span className="ml-auto whitespace-nowrap rounded-full bg-[var(--swap-bg)] px-1.5 text-xs tabular-nums text-[var(--swap-ink)]" title={`${swap} mau tukar`}>
            {shownSwap}⇄
          </span>
        )}
      </span>
      <span className="font-display text-2xl font-semibold leading-none tabular-nums text-ink">
        {shownTotal}
        <span className="ml-1 font-sans text-xs font-normal text-ink-soft">orang</span>
      </span>
      {/* bar kapasitas: estimasi, jadi tanpa angka persen */}
      <span className="block h-1 w-full overflow-hidden rounded-full bg-[var(--soft-hover)]" aria-hidden>
        <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: info.color }} />
      </span>
      <span className="sr-only">
        {total} orang sudah isi dari estimasi {cap} kursi{swap > 0 ? `, ${swap} mau tukar` : ''}
      </span>
    </button>
  );
}
