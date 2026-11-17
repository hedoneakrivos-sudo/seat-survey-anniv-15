# Seat Survey Anniv 15

Web app buat fans mengisi lokasi seat konser Anniv 15, lihat siapa yang duduk di kiri-kanan, dan cari teman tukar seat.

**Stack:** React + Vite + TypeScript + Tailwind CSS v4 · Supabase (Postgres, RLS, Realtime) · Netlify

> Status: (a) form + DB + validasi ✅ · (b) halaman hasil seat -1/+1 ✅ · (c) peta layout ✅ · (d) denah detail, heatmap, filter MAU TUKAR, share card ✅ · (e) admin + anti-spam ✅
> Belum: halaman list/filter khusus MAU TUKAR (dari spek awal tahap d).

---

## Struktur folder

```
├── index.html
├── netlify.toml                 # build + SPA redirect + security headers
├── .env.example
├── supabase/
│   └── migrations/
│       └── 0001_init.sql        # tabel, view, RLS, RPC, index, realtime
└── src/
    ├── config/seatLayout.ts     # ⭐ layout venue (DUMMY), edit di sini
    ├── lib/
    │   ├── validation.ts        # aturan validasi + normalisasi + filter kata kasar
    │   ├── validation.test.ts
    │   ├── layout.ts            # helper baca seatLayout (rentang blok, arah ltr/rtl)
    │   ├── neighbors.ts         # aturan tetangga kiri/kanan + lorong
    │   ├── neighbors.test.ts
    │   ├── api.ts               # panggilan Supabase (view + RPC)
    │   ├── storage.ts           # edit_token & device key di localStorage
    │   ├── supabase.ts
    │   └── types.ts
    ├── hooks/                   # useDuplicateCheck (debounce 400ms), dll.
    ├── components/              # SeatForm (wizard), Sheet (bottom sheet/modal), ui
    └── pages/                   # SubmitPage, SeatPage, EditSeatPage
scripts/
    ├── verify-sql.mjs           # uji migration di Postgres (PGlite)
    └── mock-supabase.mjs        # mock REST Supabase untuk coba UI lokal
```

## 1. Setup Supabase

1. Buat project di [supabase.com](https://supabase.com).
2. Buka **SQL Editor**, jalankan berurutan `supabase/migrations/0001_init.sql` lalu `0002_admin_antispam.sql`.
   (Atau pakai CLI: `supabase link` lalu `supabase db push`.)
3. Cek **Database → Replication**: tabel `seats` harus masuk publikasi `supabase_realtime` (migration sudah menambahkannya).
4. Ambil **Project URL** dan **anon public key** di *Project Settings → API*.

### Model keamanan

| Akses | Lewat | Catatan |
|---|---|---|
| Baca | view `seats_public` | Kolom `edit_token_hash` tidak pernah terekspos (column-level GRANT) |
| Tambah | RPC `submit_seat` | Honeypot, rate limit (5/jam per perangkat, 30/jam per IP), filter kata kasar, cek duplikat |
| Edit / hapus | RPC `update_seat` / `delete_seat` | Wajib `edit_token` asli. DB hanya menyimpan hash SHA-256-nya |
| Lapor entri | RPC `report_seat` | 1 laporan/perangkat/entri, 10/jam. 3 pelapor berbeda → entri disembunyikan otomatis |
| Admin | RPC `admin_*` | Wajib token sesi dari `admin_login` (bcrypt, 5 percobaan/20 menit, sesi 12 jam) |
| Tulis langsung ke tabel | — | Ditutup untuk `anon` |

`edit_token` dibuat acak di browser (192-bit) dan disimpan di `localStorage`. Tidak perlu login.

**Jangan pernah** taruh `service_role` key di frontend atau env Netlify yang berawalan `VITE_`.

## 2. Jalankan lokal

```bash
cp .env.example .env      # isi VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY
npm install
npm run dev               # http://localhost:5173
npm test                  # unit test validasi
npm run build
```

Tanpa `.env`, app jalan dalam **mode demo**: form bisa dicoba, tapi belum bisa mengirim data.

## 3. Deploy ke Netlify

1. Push repo ke GitHub/GitLab, lalu **Add new site → Import from Git** di Netlify.
2. Build command `npm run build`, publish dir `dist` (sudah diatur di `netlify.toml`).
3. **Site settings → Environment variables**: tambahkan `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`.
4. Deploy. Redirect SPA (`/* → /index.html 200`) sudah ada di `netlify.toml`.

## 4. Edit layout venue

Semua data venue ada di `src/config/seatLayout.ts`:

- `gates`: gate yang melayani kategori itu
- `rows[].blocks`: jumlah kursi per blok (dipisah lorong), urut sesuai `blockNames`
- `numbering`: `'ltr'` atau `'rtl'`
- `verified`: **`false` = data perkiraan**, jadi validasi gate/row/seat cuma memberi peringatan dan user tetap bisa submit. Ganti ke `true` setelah dicocokkan dengan denah resmi, maka validasi jadi memblokir.

Setelah diedit, jalankan `npm test` (ada test konsistensi config), lalu deploy ulang.

## Aturan tetangga (halaman hasil)

- Tetangga dicari di **row yang sama** (`category` + `row_label`), **gate diabaikan** karena satu row bisa dilayani beberapa gate.
- "Kiri/kanan" dilihat dari kursi, menghadap panggung. Untuk penomoran `ltr`, kiri = No. −1. Untuk `rtl`, kiri = No. +1.
- Tetangga **tidak melompati lorong**. Kalau seat ada di ujung blok, kartu sisi itu menampilkan "Ujung blok, tidak ada tetangga di sisi ini".
- Kalau row/seat tidak ada di config (data dummy belum lengkap), app menebak ±1 dan memberi catatan.
- Halaman hasil ikut update otomatis lewat Supabase Realtime.

## Pengujian

```bash
npm test                                   # unit test validasi + tetangga
```

Menguji migration di Postgres sungguhan tanpa Docker (pakai PGlite, di folder terpisah):

```bash
mkdir /tmp/pgtest && cd /tmp/pgtest && npm init -y && npm i @electric-sql/pglite@0.2.17
cp <repo>/scripts/verify-sql.mjs . && node verify-sql.mjs <repo>/supabase/migrations/0001_init.sql
```

Mencoba UI dengan data contoh tanpa project Supabase:

```bash
node scripts/mock-supabase.mjs 54321
VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=mock npm run dev
```

## Admin & anti-spam (tahap e)

1. Setelah migration 0002, set password admin **sekali** di SQL Editor (minimal 10 karakter):
   ```sql
   select public.admin_set_password('password-panjang-kamu');
   ```
   Fungsi ini tidak bisa dipanggil dari browser. Menjalankannya lagi = ganti password + semua sesi admin keluar.
2. Buka `/admin` (tidak ada link di menu, halaman diberi `noindex`).
3. Yang bisa dilakukan:
   - Filter **Dilaporkan / Semua / Duplikat / Disembunyikan / MAU TUKAR**, per CAT, cari nickname/sosmed/ID perangkat.
   - Aksi massal: **Sembunyikan**, **Tampilkan** (sekaligus reset laporan), **Abaikan laporan**, **Hapus**.
   - **Blokir perangkat** pengirim entri (opsional sekalian hapus semua entrinya). Perangkat yang diblokir tidak bisa submit atau melapor. Bisa dibuka lagi.
   - Klik "perangkat xxxx" untuk melihat semua entri dari perangkat yang sama.
   - Semua aksi tercatat di tabel `admin_audit`.
4. Pengunjung bisa menekan **Laporkan** di kartu tetangga dan popup kursi di peta.

Catatan: ID perangkat berasal dari `localStorage`, jadi orang yang sengaja menghapus data browser bisa dapat ID baru. Blokir ini untuk menahan iseng, bukan penyerang serius. Rate limit per IP tetap berlaku sebagai lapisan kedua.

Uji SQL tahap (e): `node verify-sql.mjs <repo>/supabase/migrations/0001_init.sql <repo>/supabase/migrations/0002_admin_antispam.sql` (salin juga `scripts/verify-sql-admin.mjs`). Mock lokal: password admin `admin12345`.

## Aturan seat duplikat

- Identitas seat = `(category, gate, row_label, seat_number)`.
- Begitu 4 field terisi, app mengecek ke DB (debounce 400ms). Kalau seat sudah ada, muncul modal **"Ubah seat" / "Tetap kirim"**.
- "Tetap kirim" menyimpan entri dengan `is_duplicate = true`.
- Unique partial index menjamin hanya ada satu entri non-duplikat per seat. Kalau dua orang submit bersamaan, yang kalah balapan dapat modal yang sama.

## Seatmap interaktif

- Halaman utama (`/`) = denah. Pilih CAT di denah atau chip, lalu "Isi seat di CAT ini" membuka `/isi?cat=N` dengan CAT sudah terisi.
- Gambar peta: `public/assets/seatmap-map-{570,1140}.webp` (+ `.jpg` fallback), hasil crop area peta saja dari `seatmap.jpg`.
- Hotspot: `src/config/seatmapHotspots.ts` (koordinat di ruang 1920x1080). Dibuat dari segmentasi warna gambar lewat `scripts/build-hotspots.mjs`, masih perkiraan.
- **Editor hotspot**: jalankan `npm run dev`, buka `/?editor=1`. Klik untuk menambah titik, Enter untuk selesai, drag titik untuk menggeser, lalu "Export JSON" dan tempel ke `ZONES`. Editor tidak ikut ke build produksi.
- **Mode bersih**: tombol "ganti" di bawah peta. Peta digambar dari poligon SVG saja, tanpa gambar resmi. Kalau aset resmi tidak boleh dipakai, hapus file `seatmap*` dari `public/assets` dan ubah default `loadMode()` di `src/pages/MapPage.tsx` ke `'clean'`.
- Info harga/benefit/warna CAT: `src/config/catConfig.ts`.
