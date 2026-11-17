import { useState } from 'react';
import { Sheet } from './Sheet';
import { Button, Notice, cx } from './ui';
import { friendlyError, reportSeat, type ReportReason } from '../lib/api';

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'palsu', label: 'Seat palsu / ngaku-ngaku' },
  { value: 'spam', label: 'Spam / isi asal' },
  { value: 'kasar', label: 'Nama atau sosmed kasar' },
  { value: 'lainnya', label: 'Lainnya' },
];

const DONE_KEY = 'anniv15.reported';
const readDone = (): string[] => {
  try {
    return JSON.parse(sessionStorage.getItem(DONE_KEY) ?? '[]');
  } catch {
    return [];
  }
};
const markDone = (id: string) => {
  try {
    sessionStorage.setItem(DONE_KEY, JSON.stringify([...new Set([...readDone(), id])]));
  } catch {
    /* noop */
  }
};

/**
 * Tombol kecil "Laporkan" + sheet pilihan alasan.
 * 3 laporan dari perangkat berbeda → entri disembunyikan otomatis sampai dicek admin.
 */
export function ReportButton({ seatId, nickname, className }: { seatId: string; nickname: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('palsu');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(() => readDone().includes(seatId));

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      await reportSeat(seatId, reason);
      markDone(seatId);
      setDone(true);
      setOpen(false);
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return <span className={cx('text-xs font-bold text-ink-soft', className)}>✓ Sudah dilaporkan</span>;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cx('focus-ring rounded-full px-1.5 text-xs font-bold text-ink-soft underline hover:text-red-700 dark:hover:text-red-300', className)}
      >
        Laporkan
        <span className="sr-only"> entri {nickname}</span>
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={`Laporkan "${nickname}"?`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button variant="danger" loading={busy} onClick={send}>
              Kirim laporan
            </Button>
          </>
        }
      >
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm text-ink-soft">
            Laporan anonim. Kalau beberapa orang melapor, entri ini disembunyikan dulu sampai dicek admin.
          </legend>
          {REASONS.map((r) => (
            <label
              key={r.value}
              className={cx(
                'flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border px-3 text-sm font-bold text-ink',
                reason === r.value ? 'border-gold-500 bg-gold-400/20' : 'border-[var(--line)] bg-[var(--surface-2)]  ',
              )}
            >
              <input
                type="radio"
                name={`report-${seatId}`}
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="h-4 w-4 accent-gold-500"
              />
              {r.label}
            </label>
          ))}
        </fieldset>
        {err && (
          <div className="mt-3">
            <Notice tone="error">{err}</Notice>
          </div>
        )}
      </Sheet>
    </>
  );
}
