import { useEffect, useRef } from 'react';
import type { CategoryLayout } from '../config/seatLayout';
import { getRow, visualBlocks } from '../lib/layout';
import type { PublicSeat } from '../lib/types';
import { SEAT_STATE_CLASS as styles, SEAT_STATE_LABEL as labels, groupBySeat, seatState, type SeatState } from '../lib/seatState';
import { cx } from './ui';

interface Props {
  layout: CategoryLayout;
  rowLabel: string;
  mySeat: number;
  seats: PublicSeat[];
}

/**
 * Mini peta satu row: deretan kursi per blok, dipisah lorong.
 * Digulir otomatis supaya seat user terlihat di tengah.
 */
export function RowMiniMap({ layout, rowLabel, mySeat, seats }: Props) {
  const row = getRow(layout, rowLabel);
  const scroller = useRef<HTMLDivElement>(null);
  const mine = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const s = scroller.current;
    const m = mine.current;
    if (!s || !m) return;
    s.scrollLeft = m.offsetLeft - s.clientWidth / 2 + m.clientWidth / 2;
  }, [rowLabel, mySeat]);

  if (!row) {
    return (
      <p className="text-sm text-ink-soft">
        Row {rowLabel} belum ada di data layout {layout.name}, jadi mini peta belum bisa ditampilkan.
      </p>
    );
  }

  const bySeat = groupBySeat(seats);
  const stateOf = (n: number): SeatState => seatState(bySeat.get(n), n === mySeat);

  const blocks = visualBlocks(row, layout.numbering);

  return (
    <div>
      <div className="mb-2 text-center text-[11px] font-bold uppercase tracking-widest text-ink-soft">
        ↑ Arah panggung
      </div>
      <div ref={scroller} className="overflow-x-auto pb-2" tabIndex={0} aria-label={`Peta Row ${rowLabel}, bisa digeser`}>
        <div className="flex w-max items-end gap-4 px-1">
          {blocks.map((seatsInBlock, bi) => (
            <div key={bi} className="flex flex-col items-center gap-1">
              <span className="text-[11px] font-semibold text-ink-soft">
                {layout.blockNames[bi]}
              </span>
              <ol className="flex gap-1" aria-label={`Blok ${layout.blockNames[bi]}`}>
                {seatsInBlock.map((n) => {
                  const st = stateOf(n);
                  const who = bySeat.get(n)?.map((s) => s.nickname).join(', ');
                  return (
                    <li
                      key={n}
                      ref={n === mySeat ? mine : undefined}
                      title={who ? `No. ${n}: ${who}` : `No. ${n}: kosong`}
                      className={cx(
                        'grid h-7 w-7 shrink-0 place-items-center rounded-t-lg rounded-b-sm text-[10px] font-bold',
                        styles[st],
                      )}
                    >
                      <span aria-hidden>{n}</span>
                      <span className="sr-only">
                        No. {n}, {labels[st]}
                        {who && st !== 'mine' ? `: ${who}` : ''}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      </div>
      <Legend />
    </div>
  );
}

export function Legend() {
  const items: [SeatState, string][] = [
    ['mine', 'Kamu'],
    ['taken', 'Terisi'],
    ['swap', 'Mau tukar'],
    ['dup', 'Duplikat'],
    ['empty', 'Kosong'],
  ];
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft" aria-label="Keterangan warna">
      {items.map(([st, label]) => (
        <li key={st} className="flex items-center gap-1.5">
          <span
            className={cx('h-3 w-3 rounded-sm', styles[st].split(' ').filter((c) => c.startsWith('bg-') || c.startsWith('dark:bg-')).join(' '))}
            aria-hidden
          />
          {label}
        </li>
      ))}
    </ul>
  );
}
