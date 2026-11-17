import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, Notice, PageState } from '../components/ui';
import { NeighborCard } from '../components/NeighborCard';
import { RowMiniMap } from '../components/RowMiniMap';
import { CategorySeatMap } from '../components/CategorySeatMap';
import { useCategorySeats } from '../hooks/useCategorySeats';
import { Link as RouterLink } from 'react-router-dom';
import { ShareButton } from '../components/ShareButton';
import { ShareCardButton } from '../components/ShareCardButton';
import { SmileConfetti } from '../components/SmileConfetti';
import { Sheet } from '../components/Sheet';
import { deleteSeat, formatSeat, friendlyError, getSeat } from '../lib/api';
import { getCategory } from '../lib/layout';
import { planNeighbors, type NeighborSlot } from '../lib/neighbors';
import { clearMySeat } from '../lib/storage';
import type { PublicSeat } from '../lib/types';
import { useMySeat } from '../hooks/useMySeat';
import { useRowSeats } from '../hooks/useRowSeats';

export default function SeatPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const navState = location.state as { flash?: string; celebrate?: boolean } | null;
  const flash = navState?.flash;
  // konfeti hanya sekali, saat baru submit
  const [celebrate, setCelebrate] = useState(!!navState?.celebrate);
  useEffect(() => {
    if (!celebrate) return;
    const t = setTimeout(() => setCelebrate(false), 2400);
    return () => clearTimeout(t);
  }, [celebrate]);
  const mine = useMySeat();
  const isMine = mine?.id === id;

  const [seat, setSeat] = useState<PublicSeat | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'notfound' | 'error'>('loading');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    getSeat(id)
      .then((s) => {
        if (cancelled) return;
        setSeat(s);
        setStatus(s ? 'ok' : 'notfound');
        // data lokal menunjuk entri yang sudah tidak ada (mis. dihapus admin)
        if (!s && isMine) clearMySeat();
      })
      .catch((e) => {
        if (cancelled) return;
        setError(friendlyError(e));
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const row = useRowSeats(seat?.category ?? null, seat?.row_label ?? null);
  const catSeats = useCategorySeats(seat?.category ?? null);
  const layout = getCategory(seat?.category);

  // entri terbaru seat ini dari realtime (mis. setelah diedit di tab lain)
  const live = useMemo(() => row.seats.find((s) => s.id === id) ?? seat, [row.seats, id, seat]);

  const plan = useMemo(
    () => (live ? planNeighbors(layout, live.row_label, live.seat_number) : null),
    [layout, live],
  );

  const occupantsAt = (slot: NeighborSlot): PublicSeat[] => {
    if (slot.kind === 'edge' || slot.seatNumber === null) return [];
    return row.seats.filter((s) => s.seat_number === slot.seatNumber && s.id !== id);
  };

  const onDelete = async () => {
    if (!mine) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteSeat(id, mine.editToken);
      clearMySeat();
      navigate('/isi', { replace: true, state: { flash: 'Data kamu sudah dihapus.' } });
    } catch (e) {
      setDeleteError(friendlyError(e));
      setDeleting(false);
    }
  };

  if (status === 'loading') return <PageState kind="loading" title="Lagi ambil data seat…" />;
  if (status === 'error')
    return (
      <PageState kind="error" title="Gagal memuat">
        <p>{error}</p>
        <Button variant="secondary" className="mt-3" onClick={() => window.location.reload()}>
          Coba lagi
        </Button>
      </PageState>
    );
  if (status === 'notfound' || !live)
    return (
      <PageState kind="empty" title="Seat nggak ditemukan">
        Mungkin sudah dihapus.{' '}
        <Link to="/isi" className="font-bold text-ink underline decoration-gold-500 decoration-2 underline-offset-2">
          Isi seat baru
        </Link>
      </PageState>
    );

  const shareUrl = `${window.location.origin}/`;
  const seatOwnerCount = row.seats.filter((s) => s.seat_number === live.seat_number).length;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <SmileConfetti run={celebrate} />
      {flash && <Notice tone="info">{flash}</Notice>}

      {/* Kartu konfirmasi */}
      <Card className="relative overflow-hidden !border-4 !border-gold-400 shadow-lift">
        <span
          className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-gold-400/35"
          aria-hidden
        />
        <p className="text-pixel text-[11px] font-bold text-ink-soft">{isMine ? 'SEAT KAMU' : 'SEAT'}</p>
        <h1 className="mt-1 font-display text-2xl text-ink sm:text-3xl">{formatSeat(live)}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="font-semibold break-all">{live.nickname}</span>
          <Badge tone="muted">{live.sex === 'M' ? 'Laki-laki' : 'Perempuan'}</Badge>
          {live.want_swap && <Badge tone="swap">MAU TUKAR</Badge>}
          {live.is_duplicate && <Badge tone="dup">⚠ Duplikat</Badge>}
          {plan?.blockName && <Badge tone="muted">Blok {plan.blockName}</Badge>}
        </div>
        {(live.is_duplicate || seatOwnerCount > 1) && (
          <p className="mt-3 text-sm text-red-700 dark:text-red-300">
            ⚠ Seat ini diisi lebih dari satu orang. Cek lagi tiket kamu ya, mungkin ada yang salah ketik.
          </p>
        )}
        {isMine && (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:flex">
            <Button variant="secondary" onClick={() => navigate(`/seat/${id}/edit`)}>
              ✏️ Edit seat saya
            </Button>
            <Button variant="ghost" className="text-red-600 dark:text-red-400" onClick={() => setConfirmDelete(true)}>
              🗑️ Hapus data saya
            </Button>
          </div>
        )}
      </Card>

      {/* Tetangga */}
      <section aria-labelledby="neighbors-title">
        <h2 id="neighbors-title" className="title-3d mb-3 mt-6 text-2xl">
          Siapa di sebelahmu?
        </h2>
        {row.status === 'loading' || row.status === 'idle' ? (
          <div className="grid gap-3 sm:grid-cols-2" aria-busy="true">
            {[0, 1].map((i) => (
              <div key={i} className="h-36 animate-pulse rounded-2xl bg-white/50 dark:bg-white/10" />
            ))}
          </div>
        ) : row.status === 'error' ? (
          <Notice tone="error">
            {row.error}{' '}
            <button className="font-semibold underline" onClick={() => void row.reload()}>
              Coba lagi
            </button>
          </Notice>
        ) : (
          plan && (
            <div className="grid gap-3 sm:grid-cols-2">
              <NeighborCard
                side="left"
                slot={plan.left}
                occupants={occupantsAt(plan.left)}
                rowLabel={live.row_label}
                shareUrl={shareUrl}
              />
              <NeighborCard
                side="right"
                slot={plan.right}
                occupants={occupantsAt(plan.right)}
                rowLabel={live.row_label}
                shareUrl={shareUrl}
              />
            </div>
          )
        )}
        <p className="mt-2 text-xs text-ink-soft">
          Kiri/kanan dilihat dari kursi, menghadap panggung. Tetangga dicari di row yang sama, gate apa pun.
        </p>
      </section>

      {/* Mini peta */}
      {layout && (
        <section aria-labelledby="minimap-title" className="space-y-3">
          <Card>
            <h2 id="minimap-title" className="mb-3 font-display text-lg text-ink">
              Posisi kamu di Row {live.row_label}
            </h2>
            {row.status === 'ok' ? (
              <RowMiniMap layout={layout} rowLabel={live.row_label} mySeat={live.seat_number} seats={row.seats} />
            ) : (
              <div className="h-16 animate-pulse rounded-xl bg-white/50 dark:bg-white/10" />
            )}
          </Card>

          {/* peta seluruh CAT, otomatis zoom ke baris kamu */}
          <Card>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg text-ink">Seluruh {layout.name}</h2>
              <RouterLink
                to={`/?cat=${live.category}&view=detail`}
                className="text-sm font-bold text-ink underline decoration-gold-500 decoration-2 underline-offset-2"
              >
                Buka di peta besar
              </RouterLink>
            </div>
            <CategorySeatMap
              layout={layout}
              seats={catSeats.seats}
              mySeat={{ row_label: live.row_label, seat_number: live.seat_number }}
              svgClassName="h-64 sm:h-80"
            />
          </Card>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
        <ShareCardButton seat={live} />
        <ShareButton
          title="Seat Survey Anniv 15"
          text={`Aku di ${formatSeat(live)}. Sebelahku siapa? Isi seat kamu juga!`}
          url={shareUrl}
          label="Bagikan link"
        />
        <RouterLink
          to={`/?cat=${live.category}&view=detail`}
          className="focus-ring inline-flex min-h-12 items-center rounded-full border-2 border-white bg-white/85 px-5 font-extrabold text-ink dark:border-white/15 dark:bg-white/10"
        >
          👯 Cari teman satu CAT
        </RouterLink>
      </div>

      <Sheet
        open={confirmDelete}
        onClose={() => !deleting && setConfirmDelete(false)}
        title="Hapus data seat kamu?"
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={deleting} data-autofocus>
              Batal
            </Button>
            <Button variant="danger" onClick={onDelete} loading={deleting}>
              Ya, hapus
            </Button>
          </>
        }
      >
        <p>Data {formatSeat(live)} akan dihapus permanen dan tidak bisa dikembalikan.</p>
        {deleteError && (
          <div className="mt-3">
            <Notice tone="error">{deleteError}</Notice>
          </div>
        )}
      </Sheet>
    </div>
  );
}
