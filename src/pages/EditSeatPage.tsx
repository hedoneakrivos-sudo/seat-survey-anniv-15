import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { SeatForm } from '../components/SeatForm';
import { LayoutPreview } from '../components/LayoutPreview';
import { Card, PageState } from '../components/ui';
import { friendlyError, getSeat, updateSeat } from '../lib/api';
import type { PublicSeat } from '../lib/types';
import { emptyForm, type SeatFormValues } from '../lib/validation';
import { useIsDesktop } from '../hooks/useMediaQuery';
import { useMySeat } from '../hooks/useMySeat';

const toForm = (s: PublicSeat): SeatFormValues => ({
  ...emptyForm(),
  category: s.category,
  gate: s.gate,
  row_label: s.row_label,
  seat_number: String(s.seat_number),
  nickname: s.nickname,
  sex: s.sex,
  want_swap: s.want_swap,
  x_username: s.x_username ?? '',
  ig_username: s.ig_username ?? '',
});

export default function EditSeatPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const mine = useMySeat();
  const [initial, setInitial] = useState<SeatFormValues | null>(null);
  const [draft, setDraft] = useState<SeatFormValues>(emptyForm());
  const [status, setStatus] = useState<'loading' | 'ok' | 'notfound' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSeat(id)
      .then((s) => {
        if (cancelled) return;
        if (!s) return setStatus('notfound');
        const f = toForm(s);
        setInitial(f);
        setDraft(f);
        setStatus('ok');
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(friendlyError(e));
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const onChange = useCallback((v: SeatFormValues) => setDraft(v), []);

  if (mine?.id !== id) {
    return (
      <PageState kind="error" title="Nggak bisa edit seat ini">
        Seat cuma bisa diedit dari perangkat yang dipakai waktu mengisi.{' '}
        <Link to={`/seat/${id}`} className="font-bold text-ink underline decoration-gold-500 decoration-2 underline-offset-2">
          Lihat seat
        </Link>
      </PageState>
    );
  }
  if (status === 'loading') return <PageState kind="loading" title="Lagi ambil data seat…" />;
  if (status === 'error') return <PageState kind="error" title="Gagal memuat">{loadError}</PageState>;
  if (status === 'notfound' || !initial)
    return <PageState kind="empty" title="Seat nggak ditemukan">Mungkin sudah dihapus.</PageState>;

  const onSubmit = async (v: SeatFormValues, force: boolean): Promise<'ok' | 'seat_taken'> => {
    setError(null);
    try {
      await updateSeat(id, mine.editToken, v, force);
      navigate(`/seat/${id}`, { replace: true, state: { flash: '✅ Perubahan tersimpan.' } });
      return 'ok';
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? '';
      if (msg.includes('SEAT_TAKEN')) return 'seat_taken';
      setError(friendlyError(e));
      return 'ok';
    }
  };

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-8">
      <section aria-labelledby="edit-title">
        <header className="mb-5">
          <Link to={`/seat/${id}`} className="inline-flex items-center rounded-full bg-white/80 px-3 py-1 text-sm font-medium text-ink hover:bg-white">
            ← Kembali ke seat
          </Link>
          <h1 id="edit-title" className="title-3d mt-2 text-3xl sm:text-4xl">
            Edit seat kamu ✏️
          </h1>
        </header>
        <Card>
          <SeatForm
            initial={initial}
            selfId={id}
            submitLabel="Simpan perubahan"
            onSubmit={onSubmit}
            onChange={onChange}
            serverError={error}
          />
        </Card>
      </section>
      {isDesktop && (
        <aside aria-label="Pratinjau layout" className="sticky top-20 self-start">
          <LayoutPreview values={draft} />
        </aside>
      )}
    </div>
  );
}
