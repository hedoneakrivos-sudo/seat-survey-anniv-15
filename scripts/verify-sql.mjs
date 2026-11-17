// Uji migration Supabase di Postgres sungguhan (PGlite / WASM).
// Dijalankan dari /tmp/pgtest, file SQL dibaca lewat argumen.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

// argumen: 0001_init.sql [0002_admin_antispam.sql]
const sql = readFileSync(process.argv[2], 'utf8');
const sql2 = process.argv[3] ? readFileSync(process.argv[3], 'utf8') : null;
const db = new PGlite();

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) {
    pass++;
    console.log(`  PASS ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name} ${extra}`);
  }
};
const errCode = async (fn) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e.message || String(e);
  }
};

// --- prelude: tiruan lingkungan Supabase yang tidak ada di PGlite ---
await db.exec(`
  create schema if not exists extensions;
  -- pgcrypto tidak tersedia; digest() di-shim pakai sha256() bawaan PG
  create or replace function extensions.digest(data text, algo text)
  returns bytea language sql immutable as $$ select sha256(data::bytea) $$;
  -- shim bcrypt: hash deterministik, cukup untuk uji alur benar/salah password
  create or replace function extensions.gen_salt(t text, r int) returns text language sql as $$ select 's' $$;
  create or replace function extensions.crypt(pw text, salt text)
  returns text language sql immutable as $$ select 'bf$' || encode(sha256(pw::bytea), 'hex') $$;
  create or replace function extensions.gen_random_bytes(n int)
  returns bytea language sql volatile as $$ select substring(sha256((random()::text || clock_timestamp()::text)::bytea) from 1 for n) $$;
  do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  end $$;
  do $$ begin
    if not exists (select 1 from pg_publication where pubname='supabase_realtime') then
      create publication supabase_realtime;
    end if;
  end $$;
`);

// pgcrypto asli tidak bisa dipasang di PGlite
const sqlForPglite = sql.replace(
  /create extension if not exists pgcrypto with schema extensions;/,
  '-- pgcrypto di-shim oleh harness',
);

console.log('\n== migration ==');
const migErr = await errCode(() => db.exec(sqlForPglite));
ok('migration jalan tanpa error', migErr === null, migErr ?? '');
if (migErr) {
  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(1);
}

const TOKEN_A = 'a'.repeat(48);
const TOKEN_B = 'b'.repeat(48);
const submit = (over = {}) => {
  const p = {
    p_category: 3,
    p_gate: ' 3 ',
    p_row_label: ' c ',
    p_seat_number: 5,
    p_nickname: '  Rina   Dua ',
    p_sex: 'F',
    p_want_swap: false,
    p_x_username: null,
    p_ig_username: null,
    p_honeypot: '',
    p_force_duplicate: false,
    p_edit_token: TOKEN_A,
    p_client_key: 'device-123456',
    ...over,
  };
  return db.query(
    `select * from submit_seat($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      p.p_category, p.p_gate, p.p_row_label, p.p_seat_number, p.p_nickname, p.p_sex,
      p.p_want_swap, p.p_x_username, p.p_ig_username, p.p_honeypot,
      p.p_force_duplicate, p.p_edit_token, p.p_client_key,
    ],
  );
};

console.log('\n== submit_seat ==');
{
  const r = await submit();
  const row = r.rows[0];
  ok('insert berhasil & normalisasi gate/row/nickname', row.gate === '3' && row.row_label === 'C' && row.nickname === 'Rina Dua', JSON.stringify(row));
  ok('is_duplicate false', row.is_duplicate === false);
  ok('view tidak mengandung edit_token_hash', !('edit_token_hash' in row), Object.keys(row).join(','));
}
{
  const e = await errCode(() => submit({ p_honeypot: 'bot', p_client_key: 'device-honeypot' }));
  ok('honeypot ditolak', !!e && e.includes('SPAM_DETECTED'), e ?? 'tidak error');
}
{
  const e = await errCode(() => submit({ p_edit_token: 'pendek', p_client_key: 'device-token' }));
  ok('token pendek ditolak', !!e && e.includes('BAD_TOKEN'), e ?? 'tidak error');
}
{
  const e = await errCode(() => submit({ p_nickname: 'b4ngs4t', p_seat_number: 9, p_client_key: 'device-prof' }));
  ok('kata kasar ditolak (leetspeak)', !!e && e.includes('PROFANITY'), e ?? 'tidak error');
}
{
  const e = await errCode(() => submit({ p_seat_number: 5, p_client_key: 'device-dup1', p_nickname: 'Budi' }));
  ok('seat sama ditolak tanpa force', !!e && e.includes('SEAT_TAKEN'), e ?? 'tidak error');
}
{
  const r = await submit({ p_seat_number: 5, p_force_duplicate: true, p_nickname: 'Budi', p_edit_token: TOKEN_B, p_client_key: 'device-dup2' });
  ok('force duplicate → is_duplicate true', r.rows[0].is_duplicate === true);
}
{
  const n = await db.query(`select count(*)::int c from seats where category=3 and row_label='C' and seat_number=5`);
  ok('dua entri di seat yang sama', n.rows[0].c === 2, JSON.stringify(n.rows[0]));
}
{
  const e = await errCode(() =>
    db.exec(`insert into seats (category,gate,row_label,seat_number,nickname,sex,edit_token_hash)
             values (3,'3','C',5,'Curang','M','x')`),
  );
  ok('unique partial index menahan non-duplikat kedua', !!e && /unique|duplicate key/i.test(e), e ?? 'tidak error');
}
{
  const e = await errCode(() => submit({ p_nickname: '<script>x</script>', p_seat_number: 7, p_client_key: 'device-xss' }));
  ok('nickname dengan <> ditolak constraint', !!e && /check constraint/i.test(e), e ?? 'tidak error');
}
{
  const e = await errCode(() => submit({ p_row_label: 'C-1', p_seat_number: 8, p_client_key: 'device-row' }));
  ok('row_label format aneh ditolak', !!e && /check constraint/i.test(e), e ?? 'tidak error');
}
{
  const e = await errCode(() => submit({ p_seat_number: 0, p_client_key: 'device-zero' }));
  ok('seat_number 0 ditolak', !!e && /check constraint/i.test(e), e ?? 'tidak error');
}
{
  const e = await errCode(() => submit({ p_x_username: 'ada-dash', p_seat_number: 11, p_client_key: 'device-x' }));
  ok('x_username ilegal ditolak', !!e && /check constraint/i.test(e), e ?? 'tidak error');
}
{
  const r = await submit({ p_x_username: '@budi_01', p_ig_username: '@budi.01', p_seat_number: 12, p_client_key: 'device-handle' });
  ok('awalan @ dibuang', r.rows[0].x_username === 'budi_01' && r.rows[0].ig_username === 'budi.01', JSON.stringify(r.rows[0]));
}

console.log('\n== rate limit ==');
{
  // kuota per perangkat = 5/jam; 'device-rate' mulai dari 0
  let lastErr = null;
  for (let i = 0; i < 7; i++) {
    lastErr = await errCode(() => submit({ p_seat_number: 100 + i, p_client_key: 'device-rate', p_nickname: `User${i}` }));
    if (lastErr) break;
  }
  ok('submit ke-6 dari satu perangkat ditolak', !!lastErr && lastErr.includes('RATE_LIMITED'), lastErr ?? 'tidak error');
  const c = await db.query(`select count(*)::int c from seats where nickname like 'User%'`);
  ok('tepat 5 submit yang masuk', c.rows[0].c === 5, JSON.stringify(c.rows[0]));
}
{
  const e = await errCode(() => submit({ p_seat_number: 200, p_client_key: 'short' }));
  ok('client_key terlalu pendek ditolak', !!e && e.includes('RATE_LIMIT_BAD_KEY'), e ?? 'tidak error');
}

console.log('\n== update_seat / delete_seat ==');
const target = (await db.query(`select id from seats where nickname='Rina Dua' limit 1`)).rows[0].id;
{
  const e = await errCode(() =>
    db.query(`select * from update_seat($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [
      target, 'token-salah-tapi-panjang-sekali', 3, '3', 'C', 5, 'Rina', 'F', true, null, null, false, 'device-upd1',
    ]),
  );
  ok('update dengan token salah → FORBIDDEN', !!e && e.includes('FORBIDDEN'), e ?? 'tidak error');
}
{
  const r = await db.query(`select * from update_seat($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [
    target, TOKEN_A, 3, '4', 'D', 9, 'Rina Baru', 'F', true, 'rina_x', null, false, 'device-upd2',
  ]);
  const row = r.rows[0];
  ok('update dengan token benar berhasil', row.gate === '4' && row.row_label === 'D' && row.seat_number === 9 && row.want_swap === true, JSON.stringify(row));
  ok('update membersihkan flag duplikat', row.is_duplicate === false);
}
{
  const t = (await db.query(`select updated_at > created_at as changed from seats where id=$1`, [target])).rows[0];
  ok('trigger updated_at jalan', t.changed === true, JSON.stringify(t));
}
{
  // seat 5 masih dipegang entri duplikat milik Budi; pindah ke sana tanpa force harus gagal
  const budi = (await db.query(`select id from seats where nickname='Budi' and seat_number=5 limit 1`)).rows[0];
  const e = await errCode(() =>
    db.query(`select * from update_seat($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [
      budi.id, TOKEN_B, 3, '3', 'C', 12, 'Budi', 'M', false, null, null, false, 'device-upd3',
    ]),
  );
  ok('update ke seat terisi ditolak tanpa force', !!e && e.includes('SEAT_TAKEN'), e ?? 'tidak error');
}
{
  const e = await errCode(() => db.query(`select delete_seat($1,$2,$3)`, [target, 'token-salah-panjang-xxxxxxxx', 'device-del1']));
  ok('delete dengan token salah → FORBIDDEN', !!e && e.includes('FORBIDDEN'), e ?? 'tidak error');
}
{
  const r = await db.query(`select delete_seat($1,$2,$3) as done`, [target, TOKEN_A, 'device-del2']);
  const left = await db.query(`select count(*)::int c from seats where id=$1`, [target]);
  ok('delete dengan token benar berhasil', r.rows[0].done === true && left.rows[0].c === 0);
}

console.log('\n== hak akses & RLS ==');
{
  const r = await db.query(`
    select has_table_privilege('anon','public.seats','insert') ins,
           has_table_privilege('anon','public.seats','update') upd,
           has_table_privilege('anon','public.seats','delete') del,
           has_column_privilege('anon','public.seats','nickname','select') can_nick,
           has_column_privilege('anon','public.seats','edit_token_hash','select') can_token,
           has_table_privilege('anon','public.submit_log','select') log_sel`);
  const p = r.rows[0];
  ok('anon tidak bisa insert/update/delete langsung', !p.ins && !p.upd && !p.del, JSON.stringify(p));
  ok('anon bisa baca kolom aman', p.can_nick === true);
  ok('anon TIDAK bisa baca edit_token_hash', p.can_token === false);
  ok('anon tidak bisa baca submit_log', p.log_sel === false);
}
{
  const r = await db.query(`
    select has_function_privilege('anon','public.submit_seat(smallint,text,text,int,text,text,boolean,text,text,text,boolean,text,text)','execute') sub,
           has_function_privilege('anon','public.enforce_rate_limit(text,text,int,interval)','execute') rl,
           has_function_privilege('anon','public.hash_token(text)','execute') ht,
           has_function_privilege('anon','public.rate_limit(text,text,int,int)','execute') rl2`);
  const p = r.rows[0];
  ok('anon boleh panggil submit_seat', p.sub === true, JSON.stringify(p));
  ok('anon tidak boleh panggil helper rate limit', p.rl === false && p.rl2 === false, JSON.stringify(p));
  ok('anon tidak boleh panggil hash_token', p.ht === false);
}
{
  const r = await db.query(`select relrowsecurity from pg_class where oid='public.seats'::regclass`);
  ok('RLS aktif di tabel seats', r.rows[0].relrowsecurity === true);
}
{
  const r = await db.query(`select count(*)::int c from pg_publication_tables where pubname='supabase_realtime' and tablename='seats'`);
  ok('seats masuk publikasi realtime', r.rows[0].c === 1);
}
{
  // migration harus idempoten (admin mungkin menjalankannya dua kali)
  const e = await errCode(() => db.exec(sqlForPglite));
  ok('migration bisa dijalankan ulang', e === null, e ?? '');
}
{
  const r = await db.query(`select indexname from pg_indexes where tablename='seats' order by 1`);
  const names = r.rows.map((x) => x.indexname);
  ok('index tetangga ada', names.includes('seats_neighbor_idx'), names.join(','));
  ok('index identitas ada', names.includes('seats_identity_idx'));
  ok('unique partial index ada', names.includes('seats_unique_non_duplicate'));
}

if (sql2) {
  const { runAdminTests } = await import('./verify-sql-admin.mjs');
  await runAdminTests({ db, ok, errCode, sql2, submit });
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
