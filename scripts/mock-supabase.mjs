/**
 * Mock Supabase REST — HANYA untuk pengujian UI lokal.
 * Meniru sebagian /rest/v1 PostgREST supaya halaman hasil bisa dicoba
 * tanpa project Supabase. Jangan dipakai di produksi.
 *
 *   node scripts/mock-supabase.mjs 54321
 */
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 54321);

let auto = 0;
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** CAT 3 Row C: blok [13,20,9] ltr → Atas 1-13, Tengah 14-33, Kanan Bawah 34-42 */
const seats = [
  // seat user: 20 (tengah blok Tengah)
  { seat_number: 20, nickname: 'Rina', sex: 'F', want_swap: false },
  { seat_number: 19, nickname: 'Dewi', sex: 'F', want_swap: true, ig_username: 'dewi.anniv', x_username: 'dewi_x' },
  // seat 21 sengaja dikosongkan → kartu "Belum ada yang isi"
  { seat_number: 14, nickname: 'Agus', sex: 'M', want_swap: false },
  { seat_number: 33, nickname: 'Bimo', sex: 'M', want_swap: true, x_username: 'bimo15' },
  { seat_number: 34, nickname: 'Cici', sex: 'F', want_swap: false },
  { seat_number: 1, nickname: 'Dion', sex: 'M', want_swap: false },
  { seat_number: 5, nickname: 'Eka', sex: 'F', want_swap: false, is_duplicate: false },
  { seat_number: 5, nickname: 'Fira', sex: 'F', want_swap: true, is_duplicate: true },
].map((s, i) => ({
  id: uid(++auto),
  category: 3,
  gate: '3',
  row_label: 'C',
  x_username: null,
  ig_username: null,
  is_duplicate: false,
  created_at: new Date(Date.now() - (10 - i) * 60000).toISOString(),
  ...s,
}));

const MY_ID = seats[0].id;
const blocked = new Set();
// contoh entri yang sudah dilaporkan
Object.assign(seats[4], { report_count: 2, report_reasons: ['palsu', 'spam'] });

const send = (res, code, body, extra = {}) => {
  res.writeHead(code, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    ...extra,
  });
  res.end(body === null ? '' : JSON.stringify(body));
};

const pgErr = (res, code, message) => send(res, code, { message, code: 'P0001', details: null, hint: null });

function applyQuery(rows, params) {
  let out = [...rows];
  for (const [key, raw] of params) {
    if (['select', 'order', 'limit', 'offset'].includes(key)) continue;
    const [op, ...rest] = raw.split('.');
    const val = rest.join('.');
    if (op === 'eq') out = out.filter((r) => String(r[key]) === val);
    else if (op === 'neq') out = out.filter((r) => String(r[key]) !== val);
  }
  for (const ord of params.getAll('order')) {
    const [col, dir] = ord.split('.');
    out.sort((a, b) => {
      const x = a[col], y = b[col];
      const c = x === y ? 0 : x < y ? -1 : 1;
      return dir === 'desc' ? -c : c;
    });
  }
  const limit = params.get('limit');
  if (limit) out = out.slice(0, Number(limit));
  return out;
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (req.method === 'OPTIONS') return send(res, 204, null);

  // GET /rest/v1/seats_public
  if (req.method === 'GET' && url.pathname === '/rest/v1/seats_public') {
    const rows = applyQuery(seats.filter((s) => !s.hidden), url.searchParams);
    const single = (req.headers.accept ?? '').includes('vnd.pgrst.object');
    if (single) {
      if (rows.length === 0) return send(res, 200, null); // maybeSingle → null
      return send(res, 200, rows[0]);
    }
    return send(res, 200, rows);
  }

  // POST /rest/v1/rpc/<fn>
  if (req.method === 'POST' && url.pathname.startsWith('/rest/v1/rpc/')) {
    const fn = url.pathname.split('/').pop();
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const b = raw ? JSON.parse(raw) : {};
      if (fn === 'submit_seat') {
        if (b.p_honeypot) return pgErr(res, 400, 'SPAM_DETECTED');
        const taken = seats.some(
          (s) =>
            s.category === b.p_category && s.gate === b.p_gate && s.row_label === b.p_row_label &&
            s.seat_number === b.p_seat_number && !s.is_duplicate,
        );
        if (taken && !b.p_force_duplicate) return pgErr(res, 400, 'SEAT_TAKEN');
        const row = {
          id: uid(++auto),
          category: b.p_category,
          gate: b.p_gate,
          row_label: b.p_row_label,
          seat_number: b.p_seat_number,
          nickname: b.p_nickname,
          sex: b.p_sex,
          want_swap: !!b.p_want_swap,
          x_username: b.p_x_username ?? null,
          ig_username: b.p_ig_username ?? null,
          is_duplicate: taken,
          created_at: new Date().toISOString(),
        };
        seats.push(row);
        return send(res, 200, row);
      }
      if (fn === 'update_seat') {
        const i = seats.findIndex((s) => s.id === b.p_id);
        if (i < 0 || !b.p_edit_token) return pgErr(res, 403, 'FORBIDDEN');
        const taken = seats.some(
          (s) =>
            s.id !== b.p_id && s.category === b.p_category && s.gate === b.p_gate &&
            s.row_label === b.p_row_label && s.seat_number === b.p_seat_number && !s.is_duplicate,
        );
        if (taken && !b.p_force_duplicate) return pgErr(res, 400, 'SEAT_TAKEN');
        seats[i] = {
          ...seats[i],
          category: b.p_category, gate: b.p_gate, row_label: b.p_row_label,
          seat_number: b.p_seat_number, nickname: b.p_nickname, sex: b.p_sex,
          want_swap: !!b.p_want_swap, x_username: b.p_x_username ?? null,
          ig_username: b.p_ig_username ?? null, is_duplicate: taken,
        };
        return send(res, 200, seats[i]);
      }
      if (fn === 'delete_seat') {
        const i = seats.findIndex((s) => s.id === b.p_id);
        if (i < 0 || !b.p_edit_token) return pgErr(res, 403, 'FORBIDDEN');
        seats.splice(i, 1);
        return send(res, 200, true);
      }
      // ---- tahap (e): laporan + admin (password mock: admin12345) ----
      const SESS = 'mock-admin-session';
      const authed = () => b.p_session === SESS;
      const ids = new Set(b.p_ids ?? []);
      if (fn === 'report_seat') {
        const s = seats.find((x) => x.id === b.p_id);
        if (!s) return pgErr(res, 400, 'NOT_FOUND');
        s.report_count = (s.report_count ?? 0) + 1;
        s.report_reasons = [...new Set([...(s.report_reasons ?? []), b.p_reason])];
        if (s.report_count >= 3) s.hidden = true;
        return send(res, 200, true);
      }
      if (fn === 'admin_login') return send(res, 200, b.p_password === 'admin12345' ? SESS : null);
      if (fn === 'admin_logout') return send(res, 200, null);
      if (fn.startsWith('admin_') && !authed()) return pgErr(res, 401, 'ADMIN_AUTH');
      const dev = (s) => s.device_id ?? (s.device_id = s.nickname === 'Fira' || s.nickname === 'Bimo' ? 'a1b2c3d4e5' : 'dev' + s.id.slice(-7));
      if (fn === 'admin_stats')
        return send(res, 200, {
          total: seats.length, reported: seats.filter((s) => s.report_count).length,
          duplicate: seats.filter((s) => s.is_duplicate).length, hidden: seats.filter((s) => s.hidden).length,
          blocked: blocked.size, last_hour: seats.length,
        });
      if (fn === 'admin_list_seats') {
        const q = (b.p_query ?? '').toLowerCase();
        let out = seats.filter((s) =>
          (!b.p_category || s.category === b.p_category) &&
          (!q || s.nickname.toLowerCase().includes(q) || dev(s) === q) &&
          ({ reported: s.report_count > 0, duplicate: s.is_duplicate, hidden: s.hidden, swap: s.want_swap }[b.p_flag] ?? true));
        if (b.p_flag === 'reported') out.sort((x, y) => (y.report_count ?? 0) - (x.report_count ?? 0));
        const total = out.length;
        out = out.slice(b.p_offset, b.p_offset + b.p_limit).map((s) => ({
          hidden: false, report_count: 0, report_reasons: null, ...s, device_id: dev(s),
          device_entries: seats.filter((x) => dev(x) === dev(s)).length, device_blocked: blocked.has(dev(s)), total_count: total,
        }));
        return send(res, 200, out);
      }
      if (fn === 'admin_delete_seats') {
        const before = seats.length;
        for (let i = seats.length - 1; i >= 0; i--) if (ids.has(seats[i].id)) seats.splice(i, 1);
        return send(res, 200, before - seats.length);
      }
      if (fn === 'admin_set_hidden' || fn === 'admin_clear_reports') {
        let n = 0;
        for (const s of seats) if (ids.has(s.id)) {
          n++;
          if (fn === 'admin_set_hidden') s.hidden = !!b.p_hidden;
          if (fn === 'admin_clear_reports' || !b.p_hidden) { s.report_count = 0; s.report_reasons = null; }
        }
        return send(res, 200, n);
      }
      if (fn === 'admin_block_device') {
        const s = seats.find((x) => x.id === b.p_seat_id);
        if (!s) return pgErr(res, 400, 'NOT_FOUND');
        const d = dev(s);
        blocked.add(d);
        let n = 0;
        if (b.p_purge) for (let i = seats.length - 1; i >= 0; i--) if (dev(seats[i]) === d) { seats.splice(i, 1); n++; }
        return send(res, 200, n);
      }
      if (fn === 'admin_unblock_device') return send(res, 200, blocked.delete(b.p_device_id) ? 1 : 0);
      return pgErr(res, 404, `fungsi ${fn} tidak ada di mock`);
    });
    return;
  }

  send(res, 404, { message: 'not found in mock' });
});

server.listen(port, () => {
  console.log(`mock supabase di http://localhost:${port}`);
  console.log(`seat milik user (id untuk localStorage): ${MY_ID}`);
});
