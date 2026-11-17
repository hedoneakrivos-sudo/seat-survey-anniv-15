// Uji migration 0002 (admin + anti-spam). Dipanggil dari verify-sql.mjs.
export async function runAdminTests({ db, ok, errCode, sql2, submit }) {
  console.log('\n== migration 0002 ==');
  const migErr = await errCode(() => db.exec(sql2));
  ok('migration 0002 jalan tanpa error', migErr === null, migErr ?? '');
  if (migErr) return;
  ok('migration 0002 bisa dijalankan ulang', (await errCode(() => db.exec(sql2))) === null);

  const q1 = async (text, params = []) => (await db.query(text, params)).rows[0];
  const TOKEN = 'c'.repeat(48);

  console.log('\n== submit menyimpan hash perangkat ==');
  const s1 = (await submit({ p_seat_number: 301, p_client_key: 'device-spammer', p_nickname: 'Iseng', p_edit_token: TOKEN })).rows[0];
  const raw = await q1(`select client_key_hash, ip_hash from seats where id=$1`, [s1.id]);
  ok('client_key_hash tersimpan', typeof raw.client_key_hash === 'string' && raw.client_key_hash.length === 64);
  ok('hash perangkat tidak terlihat di view', !('client_key_hash' in s1) && !('hidden' in s1));
  {
    const p = await q1(`select has_column_privilege('anon','public.seats','client_key_hash','select') a,
                               has_column_privilege('anon','public.seats','ip_hash','select') b,
                               has_table_privilege('anon','public.seat_reports','select') c,
                               has_table_privilege('anon','public.admin_config','select') d,
                               has_table_privilege('anon','public.admin_sessions','select') e`);
    ok('anon tidak bisa baca kolom/tabel anti-spam', !p.a && !p.b && !p.c && !p.d && !p.e, JSON.stringify(p));
  }

  console.log('\n== report_seat ==');
  ok('lapor entri sendiri tidak dihitung', (await q1(`select report_seat($1,'spam','device-spammer') r`, [s1.id])).r === false);
  ok('laporan pertama masuk', (await q1(`select report_seat($1,'spam','device-rep-1') r`, [s1.id])).r === true);
  ok('lapor dua kali dari perangkat sama diabaikan', (await q1(`select report_seat($1,'spam','device-rep-1') r`, [s1.id])).r === false);
  {
    const e = await errCode(() => db.query(`select report_seat($1,'ngawur','device-rep-x')`, [s1.id]));
    ok('alasan di luar daftar ditolak', !!e && /check constraint/i.test(e), e ?? 'tidak error');
  }
  await db.query(`select report_seat($1,'palsu','device-rep-2')`, [s1.id]);
  let st = await q1(`select report_count, hidden from seats where id=$1`, [s1.id]);
  ok('2 laporan → belum disembunyikan', st.report_count === 2 && st.hidden === false, JSON.stringify(st));
  await db.query(`select report_seat($1,'kasar','device-rep-3')`, [s1.id]);
  st = await q1(`select report_count, hidden from seats where id=$1`, [s1.id]);
  ok('3 laporan → otomatis disembunyikan', st.report_count === 3 && st.hidden === true, JSON.stringify(st));
  {
    // simulasi role anon untuk cek RLS menyaring entri hidden
    await db.exec(`set role anon`);
    const c = await q1(`select count(*)::int c from seats_public where id='${s1.id}'`);
    await db.exec(`reset role`);
    ok('entri hidden tidak tampil di seats_public untuk anon', c.c === 0, JSON.stringify(c));
  }

  console.log('\n== admin login ==');
  ok('login gagal kalau password belum diset', (await q1(`select admin_login('apa saja','device-adm-0') t`)).t === null);
  {
    const e = await errCode(() => db.query(`select admin_set_password('pendek')`));
    ok('password < 10 karakter ditolak', !!e && /minimal 10/.test(e), e ?? 'tidak error');
  }
  await db.query(`select admin_set_password('rahasia-admin-123')`);
  ok('password salah → null', (await q1(`select admin_login('salah-banget','device-adm-1') t`)).t === null);
  const sess = (await q1(`select admin_login('rahasia-admin-123','device-adm-1') t`)).t;
  ok('password benar → token sesi', typeof sess === 'string' && sess.length === 64, String(sess));
  {
    let last = null;
    for (let i = 0; i < 6; i++) last = await errCode(() => db.query(`select admin_login('x','device-adm-brute')`));
    ok('tebak password ke-6 kena rate limit', !!last && last.includes('RATE_LIMITED'), last ?? 'tidak error');
  }
  {
    const p = await q1(`select has_function_privilege('anon','public.admin_set_password(text)','execute') a,
                               has_function_privilege('anon','public.admin_require(text)','execute') b`);
    ok('anon tidak bisa set password admin', !p.a && !p.b, JSON.stringify(p));
  }
  {
    const e = await errCode(() => db.query(`select * from admin_list_seats('token-palsu')`));
    ok('list tanpa sesi valid → ADMIN_AUTH', !!e && e.includes('ADMIN_AUTH'), e ?? 'tidak error');
  }

  console.log('\n== admin list & aksi ==');
  {
    const r = await db.query(`select * from admin_list_seats($1, null, null, 'reported')`, [sess]);
    const row = r.rows[0];
    ok('filter reported: entri laporan ada di atas', row?.id === s1.id && row.report_count === 3, JSON.stringify(row));
    ok('alasan laporan ikut', Array.isArray(row?.report_reasons) && row.report_reasons.includes('palsu'));
    ok('device_id 10 karakter + jumlah entri', row?.device_id?.length === 10 && row.device_entries === 1);
  }
  {
    const r = await db.query(`select * from admin_list_seats($1, 3::smallint, 'iseng')`, [sess]);
    ok('cari nickname (case-insensitive)', r.rows.length === 1 && Number(r.rows[0].total_count) === 1, JSON.stringify(r.rows));
  }
  {
    const s = await q1(`select admin_stats($1) s`, [sess]);
    ok('admin_stats menghitung hidden & reported', s.s.hidden === 1 && s.s.reported === 1, JSON.stringify(s.s));
  }
  await db.query(`select admin_set_hidden($1, array[$2]::uuid[], false)`, [sess, s1.id]);
  st = await q1(`select report_count, hidden from seats where id=$1`, [s1.id]);
  ok('tampilkan lagi → laporan direset', st.hidden === false && st.report_count === 0, JSON.stringify(st));

  console.log('\n== blokir perangkat ==');
  await submit({ p_seat_number: 302, p_client_key: 'device-spammer', p_nickname: 'Iseng Dua', p_edit_token: TOKEN });
  const purged = (await q1(`select admin_block_device($1,$2,true) n`, [sess, s1.id])).n;
  ok('blokir + hapus semua entri perangkat itu', purged === 2, String(purged));
  {
    const e = await errCode(() => submit({ p_seat_number: 303, p_client_key: 'device-spammer', p_nickname: 'Iseng Tiga', p_edit_token: TOKEN }));
    ok('perangkat yang diblokir tidak bisa submit', !!e && e.includes('BLOCKED'), e ?? 'tidak error');
  }
  const dev = (await q1(`select left(key_hash,10) d from blocked_clients limit 1`)).d;
  await db.query(`select admin_unblock_device($1,$2)`, [sess, dev]);
  {
    const e = await errCode(() => submit({ p_seat_number: 304, p_client_key: 'device-spammer', p_nickname: 'Tobat', p_edit_token: TOKEN }));
    ok('setelah unblock bisa submit lagi', e === null, e ?? '');
  }
  {
    const id = (await q1(`select id from seats where nickname='Tobat'`)).id;
    const n = (await q1(`select admin_delete_seats($1, array[$2]::uuid[]) n`, [sess, id])).n;
    ok('admin hapus entri', n === 1);
  }
  {
    const a = await q1(`select count(*)::int c from admin_audit where action in ('delete','block','unblock','login_failed')`);
    ok('aksi admin tercatat di audit', a.c >= 4, JSON.stringify(a));
  }
  await db.query(`select admin_logout($1)`, [sess]);
  {
    const e = await errCode(() => db.query(`select admin_stats($1)`, [sess]));
    ok('setelah logout sesi tidak berlaku', !!e && e.includes('ADMIN_AUTH'), e ?? 'tidak error');
  }
}
