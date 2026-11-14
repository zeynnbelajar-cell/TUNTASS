# TUNTAS / AKSILOOP — Civic Action Platform

TUNTAS menerima laporan warga, memakai Gemini untuk analisis awal, memeriksa konteks lokasi melalui Geoapify, dan mengelompokkan keluhan serupa. Modul relawan mengubah laporan yang tersedia menjadi tugas lapangan yang dapat diklaim, diberi bukti foto, lalu diverifikasi admin.

## Fitur

### Pelaporan publik
- Form laporan dengan pencarian alamat, GPS, dan pemilihan titik di peta.
- Konteks wilayah dan tempat sekitar melalui Geoapify; data peta bukan bukti kejadian di lapangan.
- Analisis kategori, prioritas, ringkasan, dan rekomendasi oleh Gemini melalui Supabase Edge Function `analyze-report`.
- Pengelompokan laporan dengan kategori sama dan titik berjarak maksimal 50 meter.
- Riwayat keluhan warga tetap tersimpan di `report_complaints`.

### Relawan dan verifikasi
- Daftar dan masuk menggunakan Supabase Auth (email + kata sandi).
- Profil relawan dengan nama dan kontak opsional.
- Relawan dapat mengambil laporan terbuka; satu laporan hanya mempunyai satu penugasan aktif.
- Relawan dapat melepas tugas sebelum mengirim bukti.
- Pengiriman 1–3 foto bukti (JPG, PNG, WEBP; maksimal 5 MB per foto) dan catatan penanganan.
- Bukti disimpan pada bucket privat `report-evidence-private`.
- Admin melihat antrean bukti, membuka tautan foto sementara, lalu menyetujui atau menolak dengan alasan.
- Status laporan hanya menjadi `Selesai` setelah admin menyetujui bukti.

## Prasyarat

- Node.js dan npm.
- Project Supabase.
- Supabase Auth email/password aktif.
- Supabase Auth URL Configuration mengizinkan redirect `http://localhost:5173` untuk uji lokal dan origin domain produksi saat sudah dipasang.
- Secret `GEMINI_API_KEY` dan `GEOAPIFY_API_KEY` tersimpan di Supabase Edge Function Secrets.

## Konfigurasi frontend

ZIP tidak menyertakan `.env.local` untuk menjaga kunci pribadi. **Pertahankan file `.env.local` dari proyek lamamu** dan salin ke folder proyek baru. File `.env.example` berisi placeholder berikut:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_GEOAPIFY_API_KEY=
```

URL Supabase harus berupa root project (`https://PROJECT_REF.supabase.co`), bukan URL `/rest/v1` atau `/functions/v1`. Gunakan publishable key atau legacy anon key untuk frontend. Jangan pernah memasukkan service-role/secret key atau `GEMINI_API_KEY` ke variabel `VITE_`.

Geoapify browser key memang terlihat di browser; batasi allowed origins/HTTP referrer pada dashboard Geoapify. Server key `GEOAPIFY_API_KEY` tetap berada di Supabase Secrets.

## Status database project yang terhubung

Modul relawan sudah diterapkan pada project Supabase TUNTAS yang terhubung. Migrasi yang tercatat:

1. `20261112125211_volunteer_workflow`
2. `20261112125426_volunteer_workflow_hardening`
3. `20261112125457_volunteer_profile_upsert_privileges`
4. `20261112125532_volunteer_workflow_policy_consolidation`
5. `20261112125947_volunteer_profile_column_grants`

Tabel laporan lama `reports` dan `report_complaints` tidak dihapus atau di-reset. Migrasi baru menambahkan `volunteer_profiles`, `report_assignments`, dan `report_evidence`, semua dengan Row Level Security.

File `20261111_group_similar_reports.sql` adalah skrip lama yang disertakan sebagai referensi fitur penggabungan. Pada project Supabase yang sudah terhubung, jangan jalankan ulang skrip tersebut dan jangan jalankan `supabase db push` sebelum riwayat migrasi lama direkonsiliasi. Skema deduplikasi sudah aktif pada project ini; modul relawan sudah diterapkan dan diverifikasi langsung.

## Menyiapkan admin pertama

1. Buat akun melalui bagian **Masuk / daftar relawan** di aplikasi. Selesaikan konfirmasi email bila Supabase memintanya.
2. Buka Supabase Dashboard → SQL Editor.
3. Jalankan query berikut dan ganti email dengan email akun admin yang sudah terdaftar:

```sql
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
  || '{"tuntas_role":"admin"}'::jsonb
WHERE email = 'EMAIL_ADMIN_YANG_SUDAH_TERDAFTAR'
RETURNING id, email, raw_app_meta_data;
```

4. Pastikan satu baris akun yang benar dikembalikan. Keluar dari aplikasi lalu masuk kembali agar token baru memuat `app_metadata.tuntas_role = admin`.

Hak admin berasal dari `app_metadata` yang dikelola server, bukan `user_metadata` yang dapat diedit pengguna. Jangan membuat tombol promosi admin di frontend.

Untuk konfirmasi email, pastikan origin aplikasi lokal/produksi juga tercantum di Supabase Dashboard → Authentication → URL Configuration → Redirect URLs. Aplikasi mengarahkan tautan konfirmasi ke `window.location.origin`.

## Cara kerja alur relawan

1. Warga mengirim laporan seperti biasa; pelaporan publik tetap tersedia.
2. Relawan daftar/masuk dan mengisi nama profil.
3. Relawan memilih laporan berstatus `Baru` atau `Perlu Perbaikan`, lalu klik **Ambil tugas**.
4. Status berubah menjadi `Dikerjakan`. Penugasan aktif dijaga unik oleh database.
5. Relawan menyelesaikan pekerjaan dan mengunggah 1–3 foto bukti beserta catatan.
6. Status berubah menjadi `Menunggu Verifikasi`.
7. Admin memeriksa foto dan catatan. Persetujuan mengubah status menjadi `Selesai`; penolakan mengubahnya menjadi `Perlu Perbaikan` dan menyimpan alasan.

Status penugasan internal: `claimed`, `proof_submitted`, `verified`, `rejected`, `cancelled`.

## Menjalankan di Windows

Dari PowerShell pada folder `TUNTAS`:

```powershell
npm.cmd install
npm.cmd run dev
```

Buka URL lokal yang dicetak Vite. Pertahankan `.env.local` saat mengganti folder proyek. ZIP tidak menyertakan `node_modules`, cache, atau secret.

## Edge Function

Project Supabase yang terhubung menjalankan `analyze-report` versi 7 (ACTIVE). Source snapshot fungsi disertakan di `supabase/functions/analyze-report/index.ts`. Modul relawan tidak mengubah fungsi ini, jadi tidak perlu redeploy Edge Function untuk mengaktifkan fitur relawan. Sebelum melakukan redeploy fungsi di lain waktu, cocokkan source snapshot dengan source yang sedang aktif di Supabase.

Jika secret Geoapify server belum dikonfigurasi, simpan melalui Supabase CLI:

```powershell
npx.cmd supabase secrets set GEOAPIFY_API_KEY=ISI_KEY_SERVER --project-ref ssvhrnqtibmsiqlxrwss
```

## Catatan keamanan dan uji alur

- Semua tabel relawan menggunakan RLS dan grant terbatas.
- Keempat RPC relawan berjalan sebagai `SECURITY INVOKER`; role `anon` tidak dapat menjalankannya.
- Bucket bukti bersifat private; file dilihat melalui signed URL sementara.
- Admin diperiksa melalui `app_metadata.tuntas_role`.
- Sisa peringatan Security Advisor saat ini berasal dari `submit_report_with_deduplication`, RPC `SECURITY DEFINER` lama untuk mendukung laporan anonim. Peringatan itu tidak diubah agar pelaporan publik tidak rusak.

Uji end-to-end yang perlu dilakukan dari browser setelah folder diganti:
1. Daftarkan akun relawan uji dan verifikasi email jika diminta.
2. Lengkapi profil, ambil satu laporan, pastikan status menjadi `Dikerjakan`.
3. Unggah satu foto JPG/PNG/WEBP, pastikan antrean admin menampilkan bukti.
4. Masuk sebagai akun admin yang sudah diberi `app_metadata`, setujui bukti, lalu pastikan status menjadi `Selesai`.
5. Uji penolakan bukti dengan alasan; status harus menjadi `Perlu Perbaikan`.

## Struktur penting

```text
TUNTAS/
├── src/
│   ├── App.jsx
│   ├── components/
│   │   ├── AuthPanel.jsx
│   │   ├── LocationPicker.jsx
│   │   └── VolunteerCenter.jsx
│   ├── lib/supabase.js
│   └── style.css
├── supabase/
│   ├── functions/analyze-report/index.ts
│   └── migrations/
├── .env.local  # milikmu; tidak disertakan di ZIP
├── .env.example
├── package.json
└── package-lock.json
```
