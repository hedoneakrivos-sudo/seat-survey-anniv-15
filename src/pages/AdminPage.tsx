import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Button, Card, Field, Input, Notice, PageState, Select, Badge, cx } from '../components/ui';
import { Sheet } from '../components/Sheet';
import {
  adminBlockDevice,
  adminClearReports,
  adminDeleteSeats,
  adminListSeats,
  adminLogin,
  adminLogout,
  adminSetHidden,
  adminStats,
  adminUnblockDevice,
  friendlyError,
  type AdminFlag,
  type AdminSeat,
  type AdminStats,
} from '../lib/api';
import { supabaseConfigured } from '../lib/supabase';
import { useDebounce } from '../hooks/useDebounce';

const SESSION_KEY = 'anniv15.admin';
const PAGE = 50;

const loadSession = () => {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
};
const saveSession = (v: string | null) => {
  try {
    if (v) sessionStorage.setItem(SESSION_KEY, v);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* noop */
  }
};

const FLAGS: { value: AdminFlag; label: string }[] = [
  { value: 'reported', label: 'Dilaporkan' },
  { value: 'all', label: 'Semua' },
  { value: 'duplicate', label: 'Duplikat' },
  { value: 'hidden', label: 'Disembunyikan' },
  { value: 'swap', label: 'MAU TUKAR' },
];

export default function AdminPage() {
  const [session, setSession] = useState<string | null>(loadSession);

  useEffect(() => {
    const m = document.createElement('meta');
    m.name = 'robots';
    m.content = 'noindex,nofollow';
    document.head.appendChild(m);
    return () => m.remove();
  }, []);

  if (!supabaseConfigured)
    return (
      <PageState kind="error" title="Database belum disetel">
        Isi VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY dulu.
      </PageState>
    );

  const set = (s: string | null) => {
    saveSession(s);
    setSession(s);
  };

  return session ? (
    <AdminPanel
      session={session}
      onLogout={() => {
        void adminLogout(session).catch(() => {});
        set(null);
      }}
      onExpired={() => set(null)}
    />
  ) : (
    <LoginForm onLogin={set} />
  );
}

/* ------------------------------ login ------------------------------ */

function LoginForm({ onLogin }: { onLogin: (s: string) => void }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!pw) return;
    setBusy(true);
    setErr(null);
    try {
      const tok = await adminLogin(pw);
      if (tok) onLogin(tok);
      else setErr('Password salah.');
    } catch (e2) {
      setErr(friendlyError(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto max-w-sm">
      <h1 className="font-display font-semibold text-2xl text-ink">Admin</h1>
      <p className="mt-1 text-sm text-ink-soft">Khusus pengelola survei.</p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <Field id="admin-pw" label="Password" error={err ?? undefined}>
          <Input
            id="admin-pw"
            type="password"
            autoComplete="current-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            error={err ?? undefined}
            autoFocus
          />
        </Field>
        <Button type="submit" loading={busy} className="w-full">
          Masuk
        </Button>
      </form>
    </Card>
  );
}

/* ------------------------------ panel ------------------------------ */

type Confirm =
  | { kind: 'delete'; ids: string[] }
  | { kind: 'block'; seat: AdminSeat; purge: boolean }
  | null;

function AdminPanel({ session, onLogout, onExpired }: { session: string; onLogout: () => void; onExpired: () => void }) {
  const [flag, setFlag] = useState<AdminFlag>('reported');
  const [category, setCategory] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const q = useDebounce(query.trim(), 350);
  const [offset, setOffset] = useState(0);

  const [rows, setRows] = useState<AdminSeat[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);

  const fail = useCallback(
    (e: unknown) => {
      const m = (e as { message?: string })?.message ?? '';
      if (m.includes('ADMIN_AUTH')) return onExpired();
      setErr(friendlyError(e));
    },
    [onExpired],
  );

  const load = useCallback(async () => {
    setStatus((s) => (s === 'ready' ? s : 'loading'));
    try {
      const [list, st] = await Promise.all([
        adminListSeats(session, { category, query: q, flag, limit: PAGE, offset }),
        adminStats(session),
      ]);
      setRows(list);
      setStats(st);
      setSel((prev) => new Set([...prev].filter((id) => list.some((r) => r.id === id))));
      setStatus('ready');
    } catch (e) {
      fail(e);
      setStatus('error');
    }
  }, [session, category, q, flag, offset, fail]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => setOffset(0), [flag, category, q]);

  async function run(label: string, fn: () => Promise<number>) {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const n = await fn();
      setMsg(`${label}: ${n} entri`);
      setConfirm(null);
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  const total = rows[0]?.total_count ?? 0;
  const selIds = [...sel];
  const allChecked = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const toggle = (id: string) =>
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display font-semibold text-2xl text-ink sm:text-3xl">Admin</h1>
        <Button variant="secondary" onClick={onLogout}>
          Keluar
        </Button>
      </div>

      {stats && (
        <dl className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {(
            [
              ['Total', stats.total],
              ['Dilaporkan', stats.reported],
              ['Duplikat', stats.duplicate],
              ['Disembunyikan', stats.hidden],
              ['Diblokir', stats.blocked],
              ['1 jam terakhir', stats.last_hour],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="glass rounded-2xl px-3 py-2">
              <dt className="text-xs font-bold text-ink-soft">{k}</dt>
              <dd className="font-display font-semibold text-xl text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      <Card className="space-y-3">
        <div role="tablist" aria-label="Filter entri" className="flex flex-wrap gap-1.5">
          {FLAGS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={flag === f.value}
              onClick={() => setFlag(f.value)}
              className={cx(
                'focus-ring min-h-10 rounded-full px-3.5 text-sm font-semibold',
                flag === f.value ? 'bg-gold-400 text-gold-ink' : 'bg-[var(--surface-2)] text-ink ',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
          <Field id="adm-cat" label="CAT">
            <Select
              id="adm-cat"
              value={category ?? ''}
              onChange={(e) => setCategory(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Semua</option>
              {[1, 2, 3, 4, 5, 6, 7].map((c) => (
                <option key={c} value={c}>
                  CAT {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="adm-q" label="Cari nickname / sosmed / ID perangkat">
            <Input id="adm-q" type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
          </Field>
        </div>
      </Card>

      {err && <Notice tone="error">{err}</Notice>}
      {msg && <Notice>{msg}</Notice>}

      {/* aksi massal */}
      <div className="glass z-20 flex sm:sticky sm:top-16 flex-wrap items-center gap-2 rounded-2xl px-3 py-2">
        <label className="flex min-h-10 items-center gap-2 text-sm font-bold text-ink">
          <input
            type="checkbox"
            className="h-4 w-4 accent-gold-500"
            checked={allChecked}
            onChange={() => setSel(allChecked ? new Set() : new Set(rows.map((r) => r.id)))}
          />
          {sel.size ? `${sel.size} dipilih` : 'Pilih semua'}
        </label>
        <div className="ml-auto flex flex-wrap gap-1.5">
          <SmallBtn disabled={!sel.size || busy} onClick={() => run('Disembunyikan', () => adminSetHidden(session, selIds, true))}>
            Sembunyikan
          </SmallBtn>
          <SmallBtn disabled={!sel.size || busy} onClick={() => run('Ditampilkan', () => adminSetHidden(session, selIds, false))}>
            Tampilkan
          </SmallBtn>
          <SmallBtn disabled={!sel.size || busy} onClick={() => run('Laporan dihapus', () => adminClearReports(session, selIds))}>
            Abaikan laporan
          </SmallBtn>
          <SmallBtn danger disabled={!sel.size || busy} onClick={() => setConfirm({ kind: 'delete', ids: selIds })}>
            Hapus
          </SmallBtn>
        </div>
      </div>

      {status === 'loading' ? (
        <PageState kind="loading" title="Memuat entri…" />
      ) : status === 'error' ? (
        <PageState kind="error" title="Gagal memuat">
          <Button variant="secondary" onClick={() => void load()}>
            Coba lagi
          </Button>
        </PageState>
      ) : rows.length === 0 ? (
        <PageState kind="empty" title="Kosong">
          Nggak ada entri untuk filter ini.
        </PageState>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <AdminRow
              key={r.id}
              r={r}
              checked={sel.has(r.id)}
              onToggle={() => toggle(r.id)}
              onBlock={(purge) => setConfirm({ kind: 'block', seat: r, purge })}
              onUnblock={() => r.device_id && run('Blokir dibuka', () => adminUnblockDevice(session, r.device_id!))}
              onFilterDevice={() => r.device_id && (setFlag('all'), setCategory(null), setQuery(r.device_id))}
              busy={busy}
            />
          ))}
        </ul>
      )}

      {total > PAGE && (
        <div className="flex items-center justify-center gap-3 text-sm font-bold text-ink">
          <SmallBtn disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
            ← Sebelumnya
          </SmallBtn>
          <span>
            {offset + 1}–{Math.min(offset + PAGE, total)} dari {total}
          </span>
          <SmallBtn disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>
            Berikutnya →
          </SmallBtn>
        </div>
      )}

      <Sheet
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={
          confirm?.kind === 'delete'
            ? `Hapus ${confirm.ids.length} entri?`
            : confirm?.kind === 'block'
              ? confirm.purge
                ? 'Blokir perangkat + hapus semua entrinya?'
                : 'Blokir perangkat ini?'
              : ''
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Batal
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() => {
                if (confirm?.kind === 'delete') void run('Dihapus', () => adminDeleteSeats(session, confirm.ids));
                if (confirm?.kind === 'block')
                  void run(confirm.purge ? 'Diblokir, entri dihapus' : 'Diblokir', () =>
                    adminBlockDevice(session, confirm.seat.id, confirm.purge),
                  );
              }}
            >
              Ya, lanjut
            </Button>
          </>
        }
      >
        {confirm?.kind === 'delete' && <p className="text-sm text-ink">Entri yang dihapus tidak bisa dikembalikan.</p>}
        {confirm?.kind === 'block' && (
          <p className="text-sm text-ink">
            Perangkat <code className="font-bold">{confirm.seat.device_id}</code> ({confirm.seat.device_entries} entri) tidak
            akan bisa submit atau melapor lagi.
            {confirm.purge && ' Semua entrinya juga dihapus permanen.'} Blokir bisa dibuka lagi nanti.
          </p>
        )}
      </Sheet>
    </div>
  );
}

function AdminRow({
  r,
  checked,
  onToggle,
  onBlock,
  onUnblock,
  onFilterDevice,
  busy,
}: {
  r: AdminSeat;
  checked: boolean;
  onToggle: () => void;
  onBlock: (purge: boolean) => void;
  onUnblock: () => void;
  onFilterDevice: () => void;
  busy: boolean;
}) {
  return (
    <li
      className={cx(
        'glass rounded-2xl px-3 py-2.5',
        r.hidden && 'opacity-70',
        checked && 'ring-2 ring-gold-500',
      )}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1.5 h-4 w-4 shrink-0 accent-gold-500"
          checked={checked}
          onChange={onToggle}
          aria-label={`Pilih ${r.nickname}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold break-all text-ink">{r.nickname}</span>
            <Badge tone="muted">{r.sex === 'M' ? 'L' : 'P'}</Badge>
            {r.want_swap && <Badge tone="swap">MAU TUKAR</Badge>}
            {r.is_duplicate && <Badge tone="dup">Duplikat</Badge>}
            {r.hidden && <Badge tone="muted">Disembunyikan</Badge>}
            {r.report_count > 0 && (
              <Badge tone="dup">
                🚩 {r.report_count} · {(r.report_reasons ?? []).join(', ')}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-sm text-ink">
            <Link to={`/seat/${r.id}`} className="underline decoration-gold-500" target="_blank">
              CAT {r.category} · Gate {r.gate} · Row {r.row_label} · No. {r.seat_number}
            </Link>
          </p>
          <p className="mt-0.5 text-xs text-ink-soft">
            {r.x_username && `X @${r.x_username} · `}
            {r.ig_username && `IG @${r.ig_username} · `}
            {new Date(r.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
            {r.device_id && (
              <>
                {' · '}
                <button type="button" className="focus-ring font-bold underline" onClick={onFilterDevice}>
                  perangkat {r.device_id}
                </button>{' '}
                ({r.device_entries} entri{r.device_blocked ? ', DIBLOKIR' : ''})
              </>
            )}
          </p>
        </div>
      </div>
      {r.device_id && (
        <div className="mt-2 flex flex-wrap justify-end gap-1.5">
          {r.device_blocked ? (
            <SmallBtn disabled={busy} onClick={onUnblock}>
              Buka blokir
            </SmallBtn>
          ) : (
            <>
              <SmallBtn disabled={busy} onClick={() => onBlock(false)}>
                Blokir perangkat
              </SmallBtn>
              <SmallBtn danger disabled={busy} onClick={() => onBlock(true)}>
                Blokir + hapus semua
              </SmallBtn>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function SmallBtn({
  children,
  danger,
  ...p
}: { children: ReactNode; danger?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...p}
      className={cx(
        'focus-ring min-h-10 rounded-full border px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50',
        danger
          ? 'border-red-600 bg-red-600 text-white hover:bg-red-700'
          : 'border-[var(--line)] bg-[var(--surface-2)] text-ink hover:bg-[var(--surface-2)]  ',
      )}
    >
      {children}
    </button>
  );
}
