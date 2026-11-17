import { formatPrices, formatRupiah, getCatInfo } from '../config/catConfig';
import { getCategory } from '../lib/layout';
import { formatGateList } from '../lib/layout';
import type { CatStats } from './SeatmapInteractive';
import { GoldButton, SmileLoader } from './theme';

interface Props {
  category: number;
  /** sembunyikan chip CAT (mis. saat judul sheet sudah menyebut CAT) */
  hideChip?: boolean;
  stats?: CatStats;
  onFill: () => void;
  onClose?: () => void;
  /** CTA dimatikan saat form sudah tampil di sebelahnya */
  ctaLabel?: string;
}

export function CatInfoPanel({ category, stats, onFill, hideChip, ctaLabel = 'Isi seat di CAT ini' }: Props) {
  const info = getCatInfo(category);
  const layout = getCategory(category);
  if (!info) return null;
  const total = stats?.total ?? 0;
  const swap = stats?.swap ?? 0;

  return (
    <div className="space-y-5">
      {hideChip ? (
        layout && <p className="-mt-3 text-sm text-ink-soft">{formatGateList(layout.gates)}</p>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
            <span className="h-3 w-3 rounded-full ring-2 ring-white" style={{ background: info.color }} aria-hidden />
            CAT {category}
          </span>
          {layout && <span className="text-xs text-ink-soft">{formatGateList(layout.gates)}</span>}
        </div>
      )}

      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-soft">Harga tiket</p>
        <ul className="mt-2 divide-y divide-[var(--line)]">
          {info.prices.map((p) => (
            <li key={p.label} className="flex items-baseline justify-between gap-2 py-1.5">
              <span className="text-sm text-ink-soft">{p.label}</span>
              <span className="font-display text-lg font-semibold tabular-nums text-ink">{formatRupiah(p.amount)}</span>
            </li>
          ))}
        </ul>
        <p className="sr-only">{formatPrices(info)}</p>
      </div>

      {info.benefits.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-soft">Benefit</p>
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {info.benefits.map((b) => (
              <li key={b} className="flex gap-2">
                <span className="shrink-0 text-gold-500" aria-hidden>✦</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2" aria-live="polite">
        <Stat value={total} label="Sudah isi" />
        <Stat value={swap} label="Mau tukar" tone="swap" />
      </div>

      {total === 0 && (
        <p className="flex items-center gap-2 rounded-2xl bg-sky-50 px-3 py-2 text-sm text-ink">
          <SmileLoader className="h-5 w-5 shrink-0" spin={false} />
          Belum ada yang isi di sini, jadi yang pertama!
        </p>
      )}

      <GoldButton size="lg" className="w-full" onClick={onFill}>
        {ctaLabel}
      </GoldButton>
    </div>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: 'swap' }) {
  return (
    <div className="rounded-2xl bg-sky-50 px-3 py-2.5">
      <div className={`font-display text-2xl font-semibold tabular-nums ${tone === 'swap' ? 'text-orange-600' : 'text-ink'}`}>{value}</div>
      <div className="text-xs text-ink-soft">{label}</div>
    </div>
  );
}
