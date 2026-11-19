# CBT Online Sekolah/Madrasah

Aplikasi Computer Based Test (CBT) online berbasis web untuk sekolah, madrasah, PKBM, dan lembaga pendidikan. Dibangun dengan React, TypeScript, Tailwind CSS, Express + WebSocket, serta skema database relasional 17 tabel untuk Supabase (PostgreSQL + RLS + Storage) dengan fallback transaksional SQLite WAL lokal apabila konfigurasi Supabase belum disetel.

## Fitur Utama

1. **Autentikasi & Keamanan Berlapis**
   - Login terpisah **Admin/Proktor** (username/email) dan **Siswa** (NIS/username).
   - Pengamanan *rate limiting*, *account lockout* setelah 5x gagal login, validasi role berbasis server/database, dan *audit log*.
   - Token ujian divalidasi server, pembatasan 1 sesi ujian aktif per peserta, dan pengacakan soal & opsi jawaban.
   - Kunci jawaban tidak pernah dikirim ke browser siswa sebelum waktu dan publikasi nilai dibuka oleh admin.
2. **Manajemen Akademik & Bank Soal**
   - Profil Sekolah & Tahun Pelajaran/Semester aktif.
   - Manajemen Siswa (CRUD, pencarian, filter kelas, **Impor/Ekspor Excel**, reset password, aktivasi/nonaktivasi).
   - Manajemen Kelas & Mutasi Siswa antarkelas.
   - Manajemen Mata Pelajaran.
   - Bank Soal mendukung: Pilihan Ganda Tunggal, Pilihan Ganda Kompleks, Benar/Salah, Isian Singkat, Uraian, Soal Bergambar (JPG/PNG/WebP), Soal Berbasis Tabel, dan Rumus Matematika/Kimia LaTeX via **KaTeX + mhchem**.
3. **Ruang Ujian & Monitoring Real-Time**
   - Timer hitung mundur berbasis waktu server.
   - Autosave asinkron idempotent dengan *client sequence* dan antrean pemulihan koneksi.
   - Navigasi nomor soal (Hijau: dijawab, Kuning: ditandai, Abu-abu: belum dijawab).
   - Monitoring Real-Time berbasis **WebSocket** untuk memantau peserta aktif, sisa waktu, status koneksi, dan catatan aktivitas (keluar fullscreen, pindah tab, kehilangan fokus).
4. **Penilaian Otomatis, Koreksi Manual & Laporan**
   - Penilaian otomatis PG, PG Kompleks, Benar/Salah, dan Isian Singkat; serta koreksi manual Uraian oleh admin.
   - Analisis butir soal dan publikasi nilai terkontrol.
   - Ekspor laporan nilai ke **Excel (.xlsx)** dan **PDF (.pdf)**.

## Konfigurasi & Instalasi

1. Salin berkas `.env.example` menjadi `.env`:
   ```bash
   cp .env.example .env
   ```
2. Untuk mengaktifkan **Supabase** di lingkungan produksi:
   - Jalankan migrasi pada folder `supabase/migrations/` secara berurutan (`001_init_schema.sql`, `002_rls_policies.sql`, `003_functions_and_storage.sql`) di SQL Editor proyek Supabase Anda.
   - Isi variabel `SUPABASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, dan `SUPABASE_SERVICE_ROLE_KEY` (khusus server).
   - Jalankan pengujian keamanan RLS menggunakan `supabase/tests/rls_tests.sql`.
3. Instal dependensi dan jalankan aplikasi:
   ```bash
   npm install
   npm run dev
   ```
   Untuk produksi:
   ```bash
   npm run build
   npm start
   ```

## Panduan Penggunaan Singkat

### Kredensial Uji Coba Bawaan
- **Admin**: Username `admin` / Password `AdminCBT2026!`
- **Siswa**: NIS `20261001` / Password `Siswa2026!`
- **Token Ujian Aktif**: `CBT2026`

### Alur Pengujian Beban (100 & 200 Pengguna Virtual)
1. Masuk sebagai **Admin** -> buka menu **Pengaturan**.
2. Gunakan panel **Uji Beban Konkurensi** (`Uji 100 VU` atau `Uji 200 VU`) atau jalankan skrip `npx tsx scripts/load-test.ts` untuk memverifikasi latensi P95 dan memastikan 0 jawaban hilang.
