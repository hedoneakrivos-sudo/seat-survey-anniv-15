-- ============================================================
--  Seat Survey Anniv 15 — schema awal (Fase 1a)
--  Jalankan di Supabase SQL Editor, atau:
--    supabase db push
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------
-- Tabel utama
-- ---------------------------------------------------------------
create table if not exists public.seats (
  id              uuid primary key default gen_random_uuid(),
  category        smallint     not null check (category between 1 and 7),
  gate            text         not null check (gate ~ '^[A-Z0-9-]{1,10}$'),
  row_label       text         not null check (row_label ~ '^([A-Z]{1,3}|[0-9]{1,3})$'),
  seat_number     int          not null check (seat_number >= 1 and seat_number <= 9999),
  nickname        text         not null check (char_length(nickname) between 2 and 30 and nickname !~ '[<>]'),
  sex             text         not null check (sex in ('M','F')),
  want_swap       boolean      not null default false,
  x_username      text         null check (x_username ~ '^[A-Za-z0-9_]{1,15}$'),
  ig_username     text         null check (ig_username ~ '^[A-Za-z0-9._]{1,30}$'),
  is_duplicate    boolean      not null default false,
  edit_token_hash text         not null,
  created_at      timestamptz  not null default now(),
  updated_at      timestamptz  not null default now()
);

-- Lookup seat & query tetangga
create index if not exists seats_identity_idx on public.seats (category, gate, row_label, seat_number);
create index if not exists seats_neighbor_idx on public.seats (category, row_label, seat_number);
create index if not exists seats_want_swap_idx on public.seats (want_swap) where want_swap;

-- Satu seat hanya boleh satu entri non-duplikat
create unique index if not exists seats_unique_non_duplicate
  on public.seats (category, gate, row_label, seat_number)
  where is_duplicate = false;

-- updated_at otomatis
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists seats_touch_updated_at on public.seats;
create trigger seats_touch_updated_at before update on public.seats
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------
-- Rate limit sederhana (per hash perangkat/IP)
-- ---------------------------------------------------------------
create table if not exists public.submit_log (
  id         bigserial primary key,
  client_key text        not null,
  action     text        not null,
  created_at timestamptz not null default now()
);
create index if not exists submit_log_key_time_idx on public.submit_log (client_key, created_at desc);

-- ---------------------------------------------------------------
-- View publik: TANPA edit_token_hash
-- ---------------------------------------------------------------
-- create or replace (bukan drop) supaya migration aman dijalankan ulang:
-- fungsi RPC di bawah memakai tipe baris view ini.
create or replace view public.seats_public
with (security_invoker = true) as
select id, category, gate, row_label, seat_number, nickname, sex,
       want_swap, x_username, ig_username, is_duplicate, created_at
from public.seats;

grant select on public.seats_public to anon, authenticated;

-- ---------------------------------------------------------------
-- RLS: tabel seats tertutup total untuk anon.
-- Semua akses lewat view (select) dan RPC (write).
-- ---------------------------------------------------------------
alter table public.seats enable row level security;
alter table public.submit_log enable row level security;

drop policy if exists seats_select_public on public.seats;
create policy seats_select_public on public.seats
  for select to anon, authenticated using (true);
-- Catatan: kolom edit_token_hash tetap tidak terekspos karena
-- GRANT di bawah membatasi SELECT hanya ke kolom aman.

revoke all on public.seats from anon, authenticated;
grant select (id, category, gate, row_label, seat_number, nickname, sex,
              want_swap, x_username, ig_username, is_duplicate, created_at)
  on public.seats to anon, authenticated;

-- submit_log: tidak bisa diakses langsung sama sekali
revoke all on public.submit_log from anon, authenticated;

-- ---------------------------------------------------------------
-- Util
-- ---------------------------------------------------------------
create or replace function public.is_profane(txt text)
returns boolean language plpgsql immutable as $$
declare
  s text;
  w text;
  words text[] := array[
    'anjing','anjg','bangsat','bajingan','kontol','memek','ngentot','ngewe',
    'jancok','jancuk','goblok','tolol','pepek','lonte',
    'fuck','bitch','asshole','pussy'
  ];
begin
  s := lower(coalesce(txt,''));
  s := translate(s, '0@1345', 'ooieas');
  s := regexp_replace(s, '[^a-z]', '', 'g');
  foreach w in array words loop
    if position(w in s) > 0 then return true; end if;
  end loop;
  return false;
end $$;

create or replace function public.hash_token(tok text)
returns text language sql immutable as $$
  select encode(extensions.digest(tok || '::seat-anniv-15', 'sha256'), 'hex');
$$;

-- Lempar error kalau client_key sudah lewat kuota
create or replace function public.enforce_rate_limit(
  p_client_key text, p_action text, p_max int, p_window interval
) returns void language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if p_client_key is null or char_length(p_client_key) < 6 then
    raise exception 'RATE_LIMIT_BAD_KEY' using errcode = '22023';
  end if;
  delete from submit_log where created_at < now() - interval '1 day';
  select count(*) into n from submit_log
   where client_key = p_client_key and action = p_action
     and created_at > now() - p_window;
  if n >= p_max then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;
  insert into submit_log (client_key, action) values (p_client_key, p_action);
end $$;

-- IP klien dari header yang diteruskan PostgREST (Supabase)
create or replace function public.request_ip()
returns text language sql stable as $$
  select coalesce(
    split_part(nullif(current_setting('request.headers', true), '')::json->>'x-forwarded-for', ',', 1),
    'unknown'
  );
$$;

-- Rate limit ganda: per perangkat (ketat) + per IP (longgar, karena IP
-- operator seluler / wifi venue sering dipakai bareng)
create or replace function public.rate_limit(p_client_key text, p_action text, p_device_max int, p_ip_max int)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- cek panjang key DULU, sebelum diberi prefix 'dev:'
  if p_client_key is null or char_length(p_client_key) < 6 then
    raise exception 'RATE_LIMIT_BAD_KEY' using errcode = '22023';
  end if;
  perform enforce_rate_limit('dev:' || p_client_key, p_action, p_device_max, interval '1 hour');
  perform enforce_rate_limit('ip:'  || request_ip(), p_action, p_ip_max,     interval '1 hour');
end $$;

-- ---------------------------------------------------------------
-- RPC: insert seat
--  - honeypot harus kosong
--  - rate limit: 5 submit / jam / perangkat
--  - p_force_duplicate = true → simpan walau seat sudah ada
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
                     want_swap, x_username, ig_username, is_duplicate, edit_token_hash)
  values (p_category, v_gate, v_row, p_seat_number, v_nick, p_sex,
          coalesce(p_want_swap,false), v_x, v_ig, v_dup, hash_token(p_edit_token))
  returning id into v_id;
  exception when unique_violation then
    raise exception 'SEAT_TAKEN' using errcode = 'P0001';
  end;

  select * into v_row_out from seats_public where id = v_id;
  return v_row_out;
end $$;

-- ---------------------------------------------------------------
-- RPC: update & delete pakai edit_token
-- ---------------------------------------------------------------
create or replace function public.update_seat(
  p_id uuid,
  p_edit_token text,
  p_category smallint,
  p_gate text,
  p_row_label text,
  p_seat_number int,
  p_nickname text,
  p_sex text,
  p_want_swap boolean default false,
  p_x_username text default null,
  p_ig_username text default null,
  p_force_duplicate boolean default false,
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
begin
  perform rate_limit(p_client_key, 'update', 20, 60);
  if not exists (select 1 from seats where id = p_id and edit_token_hash = hash_token(coalesce(p_edit_token,''))) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if is_profane(v_nick) or is_profane(coalesce(v_x,'')) or is_profane(coalesce(v_ig,'')) then
    raise exception 'PROFANITY' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from seats
     where category = p_category and gate = v_gate and row_label = v_row
       and seat_number = p_seat_number and is_duplicate = false and id <> p_id
  ) then
    if not p_force_duplicate then
      raise exception 'SEAT_TAKEN' using errcode = 'P0001';
    end if;
    v_dup := true;
  end if;

  begin
  update seats set
    category = p_category, gate = v_gate, row_label = v_row, seat_number = p_seat_number,
    nickname = v_nick, sex = p_sex, want_swap = coalesce(p_want_swap,false),
    x_username = v_x, ig_username = v_ig, is_duplicate = v_dup
  where id = p_id;
  exception when unique_violation then
    raise exception 'SEAT_TAKEN' using errcode = 'P0001';
  end;

  select * into v_row_out from seats_public where id = p_id;
  return v_row_out;
end $$;

create or replace function public.delete_seat(p_id uuid, p_edit_token text, p_client_key text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform rate_limit(p_client_key, 'delete', 20, 60);
  delete from seats where id = p_id and edit_token_hash = hash_token(coalesce(p_edit_token,''));
  if not found then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return true;
end $$;

-- ---------------------------------------------------------------
-- Hak akses RPC
-- ---------------------------------------------------------------
revoke all on function public.enforce_rate_limit(text,text,int,interval) from anon, authenticated;
revoke all on function public.hash_token(text) from anon, authenticated;
revoke all on function public.rate_limit(text,text,int,int) from anon, authenticated;
revoke all on function public.request_ip() from anon, authenticated;
-- Postgres default-nya grant EXECUTE ke PUBLIC, cabut juga
revoke all on function public.enforce_rate_limit(text,text,int,interval) from public;
revoke all on function public.rate_limit(text,text,int,int) from public;
revoke all on function public.hash_token(text) from public;
revoke all on function public.request_ip() from public;

grant execute on function public.submit_seat(smallint,text,text,int,text,text,boolean,text,text,text,boolean,text,text) to anon, authenticated;
grant execute on function public.update_seat(uuid,text,smallint,text,text,int,text,text,boolean,text,text,boolean,text) to anon, authenticated;
grant execute on function public.delete_seat(uuid,text,text) to anon, authenticated;

-- ---------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------
-- Catatan: payload realtime bisa memuat edit_token_hash. Aman, karena itu
-- SHA-256 dari token acak 128-bit dan RPC selalu minta token aslinya.
-- Frontend tetap mengambil data dari view seats_public.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'seats'
  ) then
    alter publication supabase_realtime add table public.seats;
  end if;
end $$;
