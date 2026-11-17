import { getCategory, getRow, seatCount } from '../lib/layout';
import { normCode, type SeatFormValues } from '../lib/validation';
import { formatGateList } from '../lib/layout';
import { Card } from './ui';

/**
 * Panel kanan di desktop (tahap a): ringkasan layout kategori terpilih.
 * Peta kursi interaktif penuh menyusul di tahap (c).
 */
export function LayoutPreview({ values }: { values: SeatFormValues }) {
  const layout = getCategory(values.category);
  if (!layout) {
    return (
      <Card className="flex min-h-80 items-center justify-center text-center text-ink-soft">
        <p>Pilih kategori dulu, nanti layout-nya muncul di sini 👀</p>
      </Card>
    );
  }
  const rowLabel = normCode(values.row_label);
  const row = getRow(layout, rowLabel);
  const seat = Number(values.seat_number);

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-bold">{layout.name}</h2>
        {!layout.verified && <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Data perkiraan</span>}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-ink-soft">Gate</dt>
          <dd className="font-semibold">{formatGateList(layout.gates).replace('Gate ', '')}</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Row</dt>
          <dd className="font-semibold">
            {layout.rows[0].label}–{layout.rows[layout.rows.length - 1].label} ({layout.rows.length})
          </dd>
        </div>
        <div>
          <dt className="text-ink-soft">Blok</dt>
          <dd className="font-semibold">{layout.blockNames.join(' · ')}</dd>
        </div>
      </dl>

      <div className="mt-5 text-center text-xs font-semibold uppercase tracking-widest text-slate-500">Panggung</div>
      <div className="mx-auto mt-1 h-2 w-2/3 rounded-full bg-slate-300 dark:bg-slate-700" aria-hidden />

      <ol className="mt-4 max-h-[55vh] space-y-1 overflow-auto pr-1 text-sm" aria-label="Daftar row">
        {layout.rows.map((r) => {
          const active = r.label === rowLabel;
          return (
            <li
              key={r.label}
              className={
                'flex items-center justify-between rounded-lg px-3 py-1.5 ' +
                (active ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800')
              }
            >
              <span className="font-semibold">Row {r.label}</span>
              <span className={active ? '' : 'text-ink-soft'}>
                {r.blocks.join(' | ')} = {seatCount(r)} seat
              </span>
            </li>
          );
        })}
      </ol>
      {row && Number.isInteger(seat) && seat >= 1 && (
        <p className="mt-3 text-sm text-ink-soft" aria-live="polite">
          Seat {seat} dari {seatCount(row)} di Row {row.label}.
        </p>
      )}
    </Card>
  );
}
