import { requireSupabase } from './supabase';
import { PUBLIC_COLUMNS, type PublicSeat } from './types';
import { toPayload, normCode, type SeatFormValues } from './validation';
import { deviceKey } from './storage';

/** Ubah error Postgres/RPC jadi pesan ramah */
export function friendlyError(err: unknown): string {
  const msg = (err as { message?: string })?.message ?? String(err);
  if (msg.includes('SUPABASE_NOT_CONFIGURED'))
    return 'Database belum disetel. Isi VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY di .env.';
  if (msg.includes('RATE_LIMITED')) return 'Kebanyakan percobaan nih. Istirahat bentar, coba lagi nanti ya.';
  if (msg.includes('SEAT_TAKEN')) return 'Seat ini barusan diisi orang lain.';
  if (msg.includes('PROFANITY')) return 'Ada kata yang nggak diizinkan di nickname/sosmed.';
  if (msg.includes('FORBIDDEN')) return 'Token edit nggak cocok. Data ini bukan punyamu atau token-nya hilang.';
  if (msg.includes('SPAM_DETECTED')) return 'Pengiriman ditolak.';
  if (msg.includes('BLOCKED')) return 'Perangkat/jaringan ini diblokir admin karena terdeteksi spam.';
  if (msg.includes('ADMIN_AUTH')) return 'Sesi admin habis. Login lagi ya.';
  if (msg.includes('NOT_FOUND')) return 'Data ini sudah nggak ada.';
  if (msg.includes('violates check constraint')) return 'Ada isian yang formatnya nggak valid.';
  if (msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('network'))
    return 'Koneksi bermasalah. Cek internet kamu lalu coba lagi.';
  return 'Ups, ada yang error. Coba lagi ya.';
}

export async function findSeatOwner(
  category: number,
  gate: string,
  rowLabel: string,
  seatNumber: number,
  excludeId?: string,
): Promise<PublicSeat | null> {
  let q = requireSupabase()
    .from('seats_public')
    .select(PUBLIC_COLUMNS)
    .eq('category', category)
    .eq('gate', normCode(gate))
    .eq('row_label', normCode(rowLabel))
    .eq('seat_number', seatNumber)
    .order('is_duplicate', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1);
  if (excludeId) q = q.neq('id', excludeId);
  const { data, error } = await q;
  if (error) throw error;
  return (data?.[0] as PublicSeat | undefined) ?? null;
}

export async function getSeat(id: string): Promise<PublicSeat | null> {
  const { data, error } = await requireSupabase()
    .from('seats_public')
    .select(PUBLIC_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as PublicSeat | null) ?? null;
}

export async function submitSeat(
  v: SeatFormValues,
  editToken: string,
  forceDuplicate: boolean,
): Promise<PublicSeat> {
  const { data, error } = await requireSupabase().rpc('submit_seat', {
    ...toPayload(v),
    p_force_duplicate: forceDuplicate,
    p_edit_token: editToken,
    p_client_key: deviceKey(),
  });
  if (error) throw error;
  return data as PublicSeat;
}

export async function updateSeat(
  id: string,
  editToken: string,
  v: SeatFormValues,
  forceDuplicate: boolean,
): Promise<PublicSeat> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { p_honeypot, ...rest } = toPayload(v);
  const { data, error } = await requireSupabase().rpc('update_seat', {
    p_id: id,
    p_edit_token: editToken,
    ...rest,
    p_force_duplicate: forceDuplicate,
    p_client_key: deviceKey(),
  });
  if (error) throw error;
  return data as PublicSeat;
}

export async function deleteSeat(id: string, editToken: string): Promise<void> {
  const { error } = await requireSupabase().rpc('delete_seat', {
    p_id: id,
    p_edit_token: editToken,
    p_client_key: deviceKey(),
  });
  if (error) throw error;
}

export function formatSeat(s: { category: number; gate: string; row_label: string; seat_number: number }) {
  return `CAT ${s.category} - Gate ${s.gate} - Row ${s.row_label} - No. ${s.seat_number}`;
}

/**
 * Semua entri di satu row (category + row_label), gate diabaikan karena
 * satu row bisa dilayani beberapa gate. Dipakai untuk tetangga & mini peta.
 */
export async function getRowSeats(category: number, rowLabel: string): Promise<PublicSeat[]> {
  const { data, error } = await requireSupabase()
    .from('seats_public')
    .select(PUBLIC_COLUMNS)
    .eq('category', category)
    .eq('row_label', rowLabel)
    .order('seat_number', { ascending: true })
    .order('is_duplicate', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as PublicSeat[];
}

/**
 * Pantau perubahan di satu kategori. Supabase Realtime hanya mendukung
 * satu filter kolom, jadi filter row dilakukan di sisi klien lewat refetch.
 * Mengembalikan fungsi untuk berhenti berlangganan.
 */
export function subscribeCategory(category: number, onChange: () => void): () => void {
  const sb = requireSupabase();
  const channel = sb
    .channel(`seats-cat-${category}-${Math.random().toString(36).slice(2, 8)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'seats', filter: `category=eq.${category}` }, () =>
      onChange(),
    )
    .subscribe();
  return () => {
    void sb.removeChannel(channel);
  };
}

/** Link profil sosmed. Username sudah divalidasi regex, tetap di-encode. */
export const xUrl = (u: string) => `https://x.com/${encodeURIComponent(u)}`;
export const igUrl = (u: string) => `https://www.instagram.com/${encodeURIComponent(u)}/`;

/**
 * Jumlah pengisi & MAU TUKAR per CAT.
 * Cukup ambil 2 kolom kecil lalu hitung di klien; untuk skala survei fans
 * (ribuan baris) ini ringan. Kalau nanti besar, ganti ke RPC/view agregat.
 */
export async function getCategoryStats(): Promise<Record<number, { total: number; swap: number }>> {
  const out: Record<number, { total: number; swap: number }> = {};
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await requireSupabase()
      .from('seats_public')
      .select('category,want_swap')
      .range(from, from + page - 1);
    if (error) throw error;
    for (const r of (data ?? []) as { category: number; want_swap: boolean }[]) {
      const s = (out[r.category] ??= { total: 0, swap: 0 });
      s.total++;
      if (r.want_swap) s.swap++;
    }
    if (!data || data.length < page) break;
  }
  return out;
}

/** Pantau semua perubahan tabel seats (untuk counter global) */
export function subscribeAll(onChange: () => void): () => void {
  const sb = requireSupabase();
  const channel = sb
    .channel(`seats-all-${Math.random().toString(36).slice(2, 8)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'seats' }, () => onChange())
    .subscribe();
  return () => {
    void sb.removeChannel(channel);
  };
}

/** Semua entri satu kategori (peta detail per CAT) */
export async function getCategorySeats(category: number): Promise<PublicSeat[]> {
  const out: PublicSeat[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await requireSupabase()
      .from('seats_public')
      .select(PUBLIC_COLUMNS)
      .eq('category', category)
      .order('row_label', { ascending: true })
      .order('seat_number', { ascending: true })
      .range(from, from + page - 1);
    if (error) throw error;
    out.push(...((data ?? []) as PublicSeat[]));
    if (!data || data.length < page) break;
  }
  return out;
}

/* ======================= anti-spam & admin (tahap e) ======================= */

export type ReportReason = 'spam' | 'palsu' | 'kasar' | 'lainnya';

/** true = laporan tercatat, false = sudah pernah lapor / entri sendiri */
export async function reportSeat(id: string, reason: ReportReason): Promise<boolean> {
  const { data, error } = await requireSupabase().rpc('report_seat', {
    p_id: id,
    p_reason: reason,
    p_client_key: deviceKey(),
  });
  if (error) throw error;
  return data === true;
}

export interface AdminSeat extends PublicSeat {
  hidden: boolean;
  report_count: number;
  report_reasons: ReportReason[] | null;
  device_id: string | null;
  device_entries: number;
  device_blocked: boolean;
  total_count: number;
}

export type AdminFlag = 'all' | 'reported' | 'duplicate' | 'hidden' | 'swap';

export interface AdminStats {
  total: number;
  reported: number;
  duplicate: number;
  hidden: number;
  blocked: number;
  last_hour: number;
}

/** Mengembalikan token sesi, atau null kalau password salah */
export async function adminLogin(password: string): Promise<string | null> {
  const { data, error } = await requireSupabase().rpc('admin_login', {
    p_password: password,
    p_client_key: deviceKey(),
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function adminLogout(session: string): Promise<void> {
  await requireSupabase().rpc('admin_logout', { p_session: session });
}

export async function adminListSeats(
  session: string,
  f: { category: number | null; query: string; flag: AdminFlag; limit: number; offset: number },
): Promise<AdminSeat[]> {
  const { data, error } = await requireSupabase().rpc('admin_list_seats', {
    p_session: session,
    p_category: f.category,
    p_query: f.query || null,
    p_flag: f.flag,
    p_limit: f.limit,
    p_offset: f.offset,
  });
  if (error) throw error;
  return (data ?? []) as AdminSeat[];
}

export async function adminStats(session: string): Promise<AdminStats> {
  const { data, error } = await requireSupabase().rpc('admin_stats', { p_session: session });
  if (error) throw error;
  return data as AdminStats;
}

async function adminRpc(fn: string, args: Record<string, unknown>): Promise<number> {
  const { data, error } = await requireSupabase().rpc(fn, args);
  if (error) throw error;
  return Number(data ?? 0);
}

export const adminDeleteSeats = (session: string, ids: string[]) =>
  adminRpc('admin_delete_seats', { p_session: session, p_ids: ids });
export const adminSetHidden = (session: string, ids: string[], hidden: boolean) =>
  adminRpc('admin_set_hidden', { p_session: session, p_ids: ids, p_hidden: hidden });
export const adminClearReports = (session: string, ids: string[]) =>
  adminRpc('admin_clear_reports', { p_session: session, p_ids: ids });
export const adminBlockDevice = (session: string, seatId: string, purge: boolean) =>
  adminRpc('admin_block_device', { p_session: session, p_seat_id: seatId, p_purge: purge });
export const adminUnblockDevice = (session: string, deviceId: string) =>
  adminRpc('admin_unblock_device', { p_session: session, p_device_id: deviceId });
