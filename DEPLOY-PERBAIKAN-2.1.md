# Deploy perbaikan Octgram 2.1

Dokumen ini memisahkan langkah untuk database baru dan database Octgram yang sudah berisi data.

## 1. Cadangkan database

Buat backup Supabase sebelum menjalankan perubahan SQL. Jangan menjalankan `schema.sql` pada database lama karena file itu ditujukan untuk instalasi baru.

## 2. Terapkan SQL

### Project Supabase baru

Jalankan satu file berikut melalui SQL Editor:

`supabase/schema.sql`

Schema baru sudah mencakup repost, daftar liker/reposter, kuota postingan, panel statistik administrator, bypass live, serta media DM sekali lihat.

### Project Octgram yang sudah berjalan

Jalankan file yang belum pernah diterapkan secara berurutan. Untuk project yang terakhir berhenti pada upgrade 008, jalankan:

1. `supabase/upgrades/009_post_reposters.sql`
2. `supabase/upgrades/010_view_once_media.sql`
3. `supabase/upgrades/011_admin_access.sql`
4. `supabase/upgrades/012_live_device_lock.sql`

Jika project berhenti sebelum 008, mulai dari nomor sesudah migrasi terakhir yang sukses. Jangan melompati nomor.

Upgrade 010 membuat bucket Supabase privat bernama `chat-once`. Foto dan video DM baru masuk ke bucket ini. Pengirim tidak memiliki akses baca. Penerima memperoleh URL singkat ketika membuka media. Saat penerima menutup media atau video selesai diputar, RPC menghapus pesan dan objek penyimpanannya.

Upgrade 011 mengakui administrator berdasarkan akun Auth dan profil. Identitas yang diizinkan:

- `okttawdr@gmail.com` atau username `okta_bringass`
- `shusensei27@gmail.com` atau username `octaxyzz_`

Kedua akun dapat memulai live tanpa 100 pengikut. Menu internal tersedia di Pengaturan, lalu `System overview`.

Upgrade 012 mengunci kontrol live ke perangkat yang memulai siaran, menolak perangkat kedua pada akun yang sama, memperbaiki status akhir live, dan menyediakan pemeriksaan status untuk penonton.

## 3. Build dan deploy

```bash
npm ci
npm run verify
```

Setelah verifikasi sukses, commit source dan hasil perubahan konfigurasi yang memang digunakan oleh deployment. Jangan commit `.env`.

## 4. Uji dua akun

1. Buka profil dan tekan jumlah pengikut serta mengikuti.
2. Buka menu tiga titik pada postingan sendiri dan postingan orang lain.
3. Uji edit caption kosong, ganti sampul, arsipkan, pulihkan, bagikan, dan hapus.
4. Tekan repost satu kali. Pastikan status dan jumlah berubah tanpa dialog tambahan.
5. Buka daftar reposter dari bubble avatar.
6. Login sebagai masing-masing administrator dan mulai live saat pengikut di bawah 100.
7. Kirim foto dan video sekali lihat. Pastikan pengirim tidak dapat membukanya.
8. Buka sebagai penerima, lalu tutup viewer. Muat ulang chat dan pastikan pesan serta objek media sudah hilang.
9. Mulai live dari perangkat pertama. Pastikan akun yang sama pada perangkat kedua tidak dapat masuk sebagai host atau mengakhiri live.
10. Uji chat penonton, lalu pastikan tombol Akhiri Live langsung menutup siaran pada semua penonton.

## 5. Catatan kompatibilitas

Lampiran gambar lama berbasis Cloudinary tetap dapat ditampilkan agar riwayat percakapan tidak rusak. Antarmuka tidak lagi menawarkan pengiriman gambar permanen. Semua pengiriman media baru memakai mode sekali lihat melalui Supabase.
