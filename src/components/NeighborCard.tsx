import type { NeighborSlot } from '../lib/neighbors';
import type { PublicSeat } from '../lib/types';
import { igUrl, xUrl } from '../lib/api';
import { Badge, Card, cx } from './ui';
import { ShareButton } from './ShareButton';
import { ReportButton } from './ReportButton';

interface Props {
  side: 'left' | 'right';
  slot: NeighborSlot;
  /** semua entri di seat tetangga (bisa >1 kalau ada duplikat) */
  occupants: PublicSeat[];
  rowLabel: string;
  shareUrl: string;
}

export function NeighborCard({ side, slot, occupants, rowLabel, shareUrl }: Props) {
  const isLeft = side === 'left';
  const heading = isLeft ? 'Seat -1 (kiri)' : 'Seat +1 (kanan)';
  const arrow = isLeft ? '←' : '→';
  const seatNo = slot.kind === 'edge' ? null : slot.seatNumber;

  return (
    <Card className="flex flex-col">
      <div className={cx('flex items-center justify-between gap-2', !isLeft && 'flex-row-reverse')}>
        <h3 className="text-sm font-bold text-ink-soft">
          <span aria-hidden>{isLeft ? `${arrow} ` : ''}</span>
          {heading}
          <span aria-hidden>{!isLeft ? ` ${arrow}` : ''}</span>
        </h3>
        {seatNo !== null && (
          <span className="text-xs font-semibold text-ink-soft">
            Row {rowLabel} · No. {seatNo}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-1 flex-col">
        {slot.kind === 'edge' ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 py-4 text-center">
            <span className="text-2xl" aria-hidden>
              {slot.reason === 'aisle' ? '🚶' : '🧱'}
            </span>
            <p className="font-semibold">Ujung blok, tidak ada tetangga di sisi ini</p>
            <p className="text-sm text-ink-soft">
              {slot.reason === 'aisle' ? 'Sebelahmu lorong.' : 'Kamu di ujung row.'}
            </p>
          </div>
        ) : seatNo === null ? (
          <p className="py-4 text-center text-ink-soft">Tidak ada seat di sisi ini.</p>
        ) : occupants.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-2 text-center">
            <p className="font-display font-semibold text-lg text-ink">Belum ada yang isi, ajak temanmu!</p>
            <ShareButton
              title="Seat Survey Anniv 15"
              text="Isi seat konser Anniv 15 kamu, yuk cek siapa di sebelahmu!"
              url={shareUrl}
            />
          </div>
        ) : (
          <ul className="space-y-3">
            {occupants.map((o) => (
              <Occupant key={o.id} seat={o} />
            ))}
          </ul>
        )}
        {slot.kind === 'unknown' && (
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
            Layout row ini belum ada di data, jadi tetangga ditebak dari nomor ±1.
          </p>
        )}
      </div>
    </Card>
  );
}

function Occupant({ seat }: { seat: PublicSeat }) {
  return (
    <li>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-display font-semibold text-xl break-all text-ink">{seat.nickname}</span>
        <Badge tone="muted">{seat.sex === 'M' ? 'Laki-laki' : 'Perempuan'}</Badge>
        {seat.want_swap && <Badge tone="swap">MAU TUKAR</Badge>}
        {seat.is_duplicate && <Badge tone="dup">⚠ Duplikat</Badge>}
        <ReportButton seatId={seat.id} nickname={seat.nickname} className="ml-auto" />
      </div>
      {(seat.x_username || seat.ig_username) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {seat.x_username && <SocialLink href={xUrl(seat.x_username)} label={`X @${seat.x_username}`} />}
          {seat.ig_username && <SocialLink href={igUrl(seat.ig_username)} label={`IG @${seat.ig_username}`} />}
        </div>
      )}
    </li>
  );
}

export function SocialLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="focus-ring inline-flex min-h-11 items-center rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3.5 text-sm font-semibold text-ink hover:bg-[var(--surface-2)]"
    >
      {label}
      <span className="sr-only"> (buka di tab baru)</span>
    </a>
  );
}
