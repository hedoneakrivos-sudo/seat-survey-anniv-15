import { formatPrices, formatRupiah, getCatInfo } from '../config/catConfig';
import { getCategory } from '../lib/layout';
import { formatGateList } from '../lib/layout';
import type { CatStats } from './SeatmapInteractive';
import { CatChip, GoldButton, SmileLoader } from './theme';

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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        {hideChip ? <span /> : <CatChip category={category} as="span" className="min-h-10 px-4 text-base" />}
        {layout && <span className="text-xs font-bold text-ink-soft">{formatGateList(layout.gates)}</span>}
      </div>

      <div>
        <p className="text-xs font-extrabold uppercase tracking-wide text-ink-soft">Harga tiket</p>
        <ul className="mt-1 space-y-0.5">
          {info.prices.map((p) => (
            <li key={p.label} className="flex items-baseline justify-between gap-2">
              <span className="font-display text-xl text-ink">{formatRupiah(p.amount)}</span>
              <span className="text-sm font-bold text-ink-soft">{p.label}</span>
            </li>
          ))}
        </ul>
        <p className="sr-only">{formatPrices(info)}</p>
      </div>

      {info.benefits.length > 0 && (
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-ink-soft">Benefit</p>
          <ul className="mt-1.5 space-y-1 text-sm font-semibold text-ink">
            {info.benefits.map((b) => (
              <li key={b} className="flex gap-2">
                <span aria-hidden>✨</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2" aria-live="polite">
        <Stat value={total} label="orang sudah isi" />
        <Stat value={swap} label="MAU TUKAR" tone="swap" />
      </div>

      {total === 0 && (
        <div className="flex items-center gap-2 rounded-2xl bg-white/60 px-3 py-2 text-sm font-bold text-ink dark:bg-white/10">
          <SmileLoader className="h-6 w-6 shrink-0" spin={false} />
          Belum ada yang senyum di sini, jadi yang pertama!
        </div>
      )}

      <GoldButton size="lg" className="w-full" onClick={onFill}>
        <SmileLoader className="h-6 w-6" spin={false} />
        {ctaLabel}
      </GoldButton>
    </div>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: 'swap' }) {
  return (
    <div className="rounded-2xl bg-white/70 px-3 py-2 text-center dark:bg-white/10">
      <div className={`font-display text-2xl tabular-nums ${tone === 'swap' ? 'text-orange-600 dark:text-orange-300' : 'text-ink'}`}>
        {value}
      </div>
      <div className="text-[11px] font-extrabold text-ink-soft">{label}</div>
    </div>
  );
}
