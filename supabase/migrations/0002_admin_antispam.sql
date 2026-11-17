-- ============================================================
--  Seat Survey Anniv 15 — Tahap (e): admin + anti-spam lanjutan
--  Jalankan SETELAH 0001_init.sql. Aman dijalankan ulang.
--
--  Setelah migration, set password admin SEKALI di SQL Editor:
--    select public.admin_set_password('password-panjang-kamu');
-- ============================================================

-- ---------------------------------------------------------------
-- Kolom tambahan (tidak pernah terekspos ke anon)
-- ---------------------------------------------------------------
alter table public.seats add column if not exists client_key_hash text;
alter table public.seats add column if not exists ip_hash        text;
alter table public.seats add column if not exists hidden         boolean not null default false;
alter table public.seats add column if not exists report_count   int     not null default 0;

create index if not exists seats_client_key_idx on public.seats (client_key_hash);
create index if not exists seats_reported_idx   on public.seats (report_count desc) where report_count > 0;

-- Entri tersembunyi tidak tampil di publik (view security_invoker ikut RLS)
drop policy if exists seats_select_public on public.seats;
create policy seats_select_public on public.seats
  for select to anon, authenticated using (hidden = false);

-- ---------------------------------------------------------------
-- Tabel pendukung (semua tertutup untuk anon)
-- ---------------------------------------------------------------
create table if not exists public.seat_reports (
  seat_id       uuid        not null references public.seats(id) on delete cascade,
  reporter_hash text        not null,
  reason        text        not null check (reason in ('spam','palsu','kasar','lainnya')),
  created_at    timestamptz not null default now(),
  primary key (seat_id, reporter_hash)
);

create table if not exists public.blocked_clients (
  key_hash   text primary key,
  note       text,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_config (
  id            int primary key default 1 check (id = 1),
  password_hash text not null,
  updated_at    timestamptz not null default now()
);

create table if not exists public.admin_sessions (
  token_hash text primary key,
  expires_at timestamptz not null
);

create table if not exists public.admin_audit (
  id         bigserial primary key,
  action     text        not null,
  detail     jsonb,
  created_at timestamptz not null default now()
);

alter table public.seat_reports    enable row level security;
alter table public.blocked_clients enable row level security;
alter table public.admin_config    enable row level security;
alter table public.admin_sessions  enable row level security;
alter table public.admin_audit     enable row level security;
revoke all on public.seat_reports, public.blocked_clients, public.admin_config,
              public.admin_sessions, public.admin_audit from anon, authenticated;

-- ---------------------------------------------------------------
-- Util anti-spam
-- ---------------------------------------------------------------
create or replace function public.client_hash(p_client_key text)
returns text language sql immutable as $$
  select hash_token('dev:' || coalesce(p_client_key, ''));
$$;

create or replace function public.ensure_not_blocked(p_client_key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from blocked_clients
              where key_hash in (client_hash(p_client_key), hash_token('ip:' || request_ip()))) then
    raise exception 'BLOCKED' using errcode = 'P0001';
  end if;
end $$;

revoke all on function public.client_hash(text) from public, anon, authenticated;
revoke all on function public.ensure_not_blocked(text) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- submit_seat versi baru: cek blokir + simpan hash perangkat/IP
-- (signature sama dengan 0001, jadi frontend tidak berubah)
-- ---------------------------------------------------------------
create or replace function public.submit_seat(
  p_category smallint,
  p_gate text,
  p_row_label text,
  p_seat_number int,
  p_nickname text,
  p_sex text,
  p_want_swap boolean default false,
  p_x_username text default null,
  p_ig_username text default null,
  p_honeypot text default '',
  p_force_duplicate boolean default false,
  p_edit_token text default null,
  p_client_key text default null
) returns public.seats_public
language plpgsql security definer set search_path = public as $$
declare
  v_gate text := upper(trim(p_gate));
  v_row  text := upper(trim(p_row_label));
  v_nick text := trim(regexp_replace(p_nickname, '\s+', ' ', 'g'));
  v_x    text := nullif(regexp_replace(coalesce(p_x_username,''), '^@+', ''), '');
  v_ig   text := nullif(regexp_replace(coalesce(p_ig_username,''), '^@+', ''), '');
  v_dup  boolean := false;
  v_row_out public.seats_public;
  v_id uuid;
begin
  if coalesce(p_honeypot, '') <> '' then
    raise exception 'SPAM_DETECTED' using errcode = 'P0001';
  end if;
  if p_edit_token is null or char_length(p_edit_token) < 20 then
    raise exception 'BAD_TOKEN' using errcode = '22023';
  end if;

  perform rate_limit(p_client_key, 'submit', 5, 30);
  perform ensure_not_blocked(p_client_key);

  if is_profane(v_nick) or is_profane(coalesce(v_x,'')) or is_profane(coalesce(v_ig,'')) then
    raise exception 'PROFANITY' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from seats
     where category = p_category and gate = v_gate
       and row_label = v_row and seat_number = p_seat_number
       and is_duplicate = false
  ) then
    if not p_force_duplicate then
      raise exception 'SEAT_TAKEN' using errcode = 'P0001';
    end if;
    v_dup := true;
  end if;

  begin
  insert into seats (category, gate, row_label, seat_number, nickname, sex,
                     want_swap, x_username, ig_username, is_duplicate, edit_token_hash,
                     client_key_hash, ip_hash)
  values (p_category, v_gate, v_row, p_seat_number, v_nick, p_sex,
          coalesce(p_want_swap,false), v_x, v_ig, v_dup, hash_token(p_edit_token),
          client_hash(p_client_key), hash_token('ip:' || request_ip()))
  returning id into v_id;
  exception when unique_violation then
    raise exception 'SEAT_TAKEN' using errcode = 'P0001';
  end;

  select * into v_row_out from seats_public where id = v_id;
  return v_row_out;
end $$;

-- ---------------------------------------------------------------
-- RPC publik: laporkan entri
--  - 1 laporan per perangkat per entri
--  - 3 pelapor berbeda → entri otomatis disembunyikan sampai dicek admin
-- ---------------------------------------------------------------
create or replace function public.report_seat(p_id uuid, p_reason text, p_client_key text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_hash text;
  v_n int;
begin
  perform rate_limit(p_client_key, 'report', 10, 60);
  perform ensure_not_blocked(p_client_key);
  v_hash := client_hash(p_client_key);

  if not exists (select 1 from seats where id = p_id and hidden = false) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  -- lapor entri sendiri tidak dihitung
  if exists (select 1 from seats where id = p_id and client_key_hash = v_hash) then
    return false;
  end if;

  insert into seat_reports (seat_id, reporter_hash, reason)
  values (p_id, v_hash, coalesce(p_reason, 'lainnya'))
  on conflict do nothing;
  if not found then return false; end if;

  select count(*) into v_n from seat_reports where seat_id = p_id;
  update seats set report_count = v_n, hidden = hidden or v_n >= 3 where id = p_id;
  return true;
end $$;

-- ---------------------------------------------------------------
-- Admin: password + sesi
-- ---------------------------------------------------------------
create or replace function public.admin_set_password(p_password text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_password is null or char_length(p_password) < 10 then
    raise exception 'Password admin minimal 10 karakter';
  end if;
  insert into admin_config (id, password_hash)
  values (1, extensions.crypt(p_password, extensions.gen_salt('bf', 10)))
  on conflict (id) do update set password_hash = excluded.password_hash, updated_at = now();
  delete from admin_sessions; -- ganti password = semua sesi lama keluar
end $$;

-- Sengaja TIDAK raise saat password salah: raise akan me-rollback catatan
-- rate limit, sehingga tebakan password tidak terhitung.
create or replace function public.admin_login(p_password text, p_client_key text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_hash text;
  v_tok  text;
begin
  perform rate_limit(p_client_key, 'admin_login', 5, 20);
  select password_hash into v_hash from admin_config where id = 1;
  if v_hash is null or extensions.crypt(coalesce(p_password, ''), v_hash) <> v_hash then
    insert into admin_audit (action, detail) values ('login_failed', null);
    return null;
  end if;
  v_tok := encode(extensions.gen_random_bytes(32), 'hex');
  delete from admin_sessions where expires_at < now();
  insert into admin_sessions (token_hash, expires_at) values (hash_token(v_tok), now() + interval '12 hours');
  insert into admin_audit (action, detail) values ('login', null);
  return v_tok;
end $$;

create or replace function public.admin_require(p_session text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from admin_sessions
                  where token_hash = hash_token(coalesce(p_session, '')) and expires_at > now()) then
    raise exception 'ADMIN_AUTH' using errcode = '42501';
  end if;
end $$;

create or replace function public.admin_logout(p_session text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from admin_sessions where token_hash = hash_token(coalesce(p_session, ''));
end $$;

-- ---------------------------------------------------------------
-- Admin: daftar entri
--  p_flag: 'all' | 'reported' | 'duplicate' | 'hidden' | 'swap'
-- ---------------------------------------------------------------
create or replace function public.admin_list_seats(
  p_session  text,
  p_category smallint default null,
  p_query    text     default null,
  p_flag     text     default 'all',
  p_limit    int      default 50,
  p_offset   int      default 0
) returns table (
  id uuid, category smallint, gate text, row_label text, seat_number int,
  nickname text, sex text, want_swap boolean, x_username text, ig_username text,
  is_duplicate boolean, hidden boolean, report_count int, report_reasons text[],
  device_id text, device_entries int, device_blocked boolean,
  created_at timestamptz, total_count bigint
) language plpgsql security definer set search_path = public as $$
declare
  v_q text := nullif(trim(coalesce(p_query, '')), '');
begin
  perform admin_require(p_session);
  return query
  select s.id, s.category, s.gate, s.row_label, s.seat_number,
         s.nickname, s.sex, s.want_swap, s.x_username, s.ig_username,
         s.is_duplicate, s.hidden, s.report_count,
         (select array_agg(distinct r.reason) from seat_reports r where r.seat_id = s.id),
         left(s.client_key_hash, 10),
         (select count(*)::int from seats d where d.client_key_hash = s.client_key_hash),
         exists (select 1 from blocked_clients b where b.key_hash = s.client_key_hash),
         s.created_at,
         count(*) over ()
    from seats s
   where (p_category is null or s.category = p_category)
     and (v_q is null
          or s.nickname ilike '%' || v_q || '%'
          or s.x_username ilike '%' || v_q || '%'
          or s.ig_username ilike '%' || v_q || '%'
          or left(s.client_key_hash, 10) = v_q)
     and case coalesce(p_flag, 'all')
           when 'reported'  then s.report_count > 0
           when 'duplicate' then s.is_duplicate
           when 'hidden'    then s.hidden
           when 'swap'      then s.want_swap
           else true end
   order by (case when coalesce(p_flag,'all') = 'reported' then s.report_count end) desc nulls last,
            s.created_at desc
   limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end $$;

create or replace function public.admin_stats(p_session text)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform admin_require(p_session);
  return json_build_object(
    'total',     (select count(*) from seats),
    'reported',  (select count(*) from seats where report_count > 0),
    'duplicate', (select count(*) from seats where is_duplicate),
    'hidden',    (select count(*) from seats where hidden),
    'blocked',   (select count(*) from blocked_clients),
    'last_hour', (select count(*) from seats where created_at > now() - interval '1 hour')
  );
end $$;

-- ---------------------------------------------------------------
-- Admin: aksi
-- ---------------------------------------------------------------
create or replace function public.admin_delete_seats(p_session text, p_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform admin_require(p_session);
  delete from seats where id = any(p_ids);
  get diagnostics n = row_count;
  insert into admin_audit (action, detail) values ('delete', json_build_object('ids', p_ids, 'n', n));
  return n;
end $$;

create or replace function public.admin_set_hidden(p_session text, p_ids uuid[], p_hidden boolean)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform admin_require(p_session);
  update seats set hidden = coalesce(p_hidden, false) where id = any(p_ids);
  get diagnostics n = row_count;
  -- "tampilkan lagi" = admin sudah cek, laporan lama dihapus
  if not coalesce(p_hidden, false) then
    delete from seat_reports where seat_id = any(p_ids);
    update seats set report_count = 0 where id = any(p_ids);
  end if;
  insert into admin_audit (action, detail)
  values (case when p_hidden then 'hide' else 'unhide' end, json_build_object('ids', p_ids, 'n', n));
  return n;
end $$;

create or replace function public.admin_clear_reports(p_session text, p_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform admin_require(p_session);
  delete from seat_reports where seat_id = any(p_ids);
  update seats set report_count = 0 where id = any(p_ids);
  get diagnostics n = row_count;
  insert into admin_audit (action, detail) values ('clear_reports', json_build_object('ids', p_ids));
  return n;
end $$;

-- Blokir perangkat pengirim entri ini. p_purge = hapus semua entrinya juga.
create or replace function public.admin_block_device(p_session text, p_seat_id uuid, p_purge boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_hash text;
  n int := 0;
begin
  perform admin_require(p_session);
  select client_key_hash into v_hash from seats where id = p_seat_id;
  if v_hash is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  insert into blocked_clients (key_hash, note) values (v_hash, 'dari entri ' || p_seat_id)
  on conflict do nothing;
  if p_purge then
    delete from seats where client_key_hash = v_hash;
    get diagnostics n = row_count;
  end if;
  insert into admin_audit (action, detail)
  values ('block', json_build_object('device', left(v_hash, 10), 'purged', n));
  return n;
end $$;

create or replace function public.admin_unblock_device(p_session text, p_device_id text)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform admin_require(p_session);
  if char_length(coalesce(p_device_id, '')) < 10 then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  delete from blocked_clients where left(key_hash, 10) = p_device_id;
  get diagnostics n = row_count;
  insert into admin_audit (action, detail) values ('unblock', json_build_object('device', p_device_id));
  return n;
end $$;

-- ---------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------
revoke all on function public.admin_set_password(text) from public, anon, authenticated;
revoke all on function public.admin_require(text)      from public, anon, authenticated;

revoke all on function public.report_seat(uuid,text,text) from public;
revoke all on function public.admin_login(text,text) from public;
revoke all on function public.admin_logout(text) from public;
revoke all on function public.admin_list_seats(text,smallint,text,text,int,int) from public;
revoke all on function public.admin_stats(text) from public;
revoke all on function public.admin_delete_seats(text,uuid[]) from public;
revoke all on function public.admin_set_hidden(text,uuid[],boolean) from public;
revoke all on function public.admin_clear_reports(text,uuid[]) from public;
revoke all on function public.admin_block_device(text,uuid,boolean) from public;
revoke all on function public.admin_unblock_device(text,text) from public;

grant execute on function public.report_seat(uuid,text,text) to anon, authenticated;
grant execute on function public.admin_login(text,text) to anon, authenticated;
grant execute on function public.admin_logout(text) to anon, authenticated;
grant execute on function public.admin_list_seats(text,smallint,text,text,int,int) to anon, authenticated;
grant execute on function public.admin_stats(text) to anon, authenticated;
grant execute on function public.admin_delete_seats(text,uuid[]) to anon, authenticated;
grant execute on function public.admin_set_hidden(text,uuid[],boolean) to anon, authenticated;
grant execute on function public.admin_clear_reports(text,uuid[]) to anon, authenticated;
grant execute on function public.admin_block_device(text,uuid,boolean) to anon, authenticated;
grant execute on function public.admin_unblock_device(text,text) to anon, authenticated;
