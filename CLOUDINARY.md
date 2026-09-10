# Penyimpanan foto post: Cloudinary

Foto **postingan** disimpan di Cloudinary (bukan Supabase Storage lagi).
Avatar profil tetap di Supabase Storage — kecil, tidak worth dipindah.

## 1. Buat akun (tanpa kartu kredit)
1. Daftar di https://cloudinary.com/users/register/free
2. Di Dashboard, catat 3 nilai: **Cloud name**, **API Key**, **API Secret**.

## 2. Isi environment variable
```
VITE_CLOUDINARY_CLOUD_NAME=xxxxx
CLOUDINARY_CLOUD_NAME=xxxxx
CLOUDINARY_API_KEY=xxxxx
CLOUDINARY_API_SECRET=xxxxx
```
`API_SECRET` hanya dipakai server (untuk menandatangani upload) — **tidak pernah**
dikirim ke browser. Untuk deploy statis, isi juga `cloudinaryCloudName` di
`public/config.js`.

## 3. Jalankan migrasi SQL
`supabase/schema.sql` (install baru) atau
`supabase/upgrades/004_grid_and_caps.sql` (project lama) sudah menyesuaikan
validasi path media ke format Cloudinary.

## 4. Cara kerjanya
1. Browser minta tanda tangan upload ke server (`POST /api/uploads/sign`) —
   server yang tanda tangani pakai API Secret, browser tidak pernah pegang secret.
2. Browser upload langsung ke Cloudinary pakai tanda tangan itu (foto tidak
   lewat server kita sama sekali — hemat bandwidth server).
3. Path yang disimpan di database adalah Cloudinary `public_id`, di-scope ke
   `octgram/posts/<user_id>_<item_id>` — dicek ulang di database supaya user
   tidak bisa klaim foto milik akun lain.
4. Saat menampilkan foto, URL dibentuk dengan `f_auto,q_auto` — Cloudinary
   otomatis kirim format & kualitas terbaik per pengunjung (AVIF/WebP) dari
   1 file yang sama, tanpa nyimpen banyak salinan.
5. Thumbnail grid profil minta ukuran kecil (`w_300`) dari Cloudinary — jadi
   grid loading jauh lebih ringan daripada full-size, tanpa nyimpen file kedua.
6. Kalau user batal posting (hapus foto/tutup halaman sebelum publish), foto
   yang sudah terupload otomatis dihapus dari Cloudinary lewat
   `DELETE /api/uploads`.

## Catatan jujur soal batasan
Server tidak memverifikasi ke Cloudinary bahwa file benar-benar ada sebelum
menerima `publish_post` — hanya memvalidasi *format* path (`octgram/posts/<uid>_...`),
bukan keberadaan filenya. Ini beda dari sebelumnya (Supabase Storage dicek
`exists()` di database). Risikonya kecil: user hanya bisa membuat post dengan
gambar rusak di postingan **miliknya sendiri** (path selalu di-scope ke uid-nya),
tidak ada celah untuk mengakses/klaim media orang lain. Kalau butuh verifikasi
ketat, bisa ditambah pengecekan lewat Cloudinary Admin API (butuh koneksi HTTP
dari database via ekstensi `pg_net`, atau verifikasi di server sebelum insert).

## Free tier
Cloudinary saat ini menyatakan paket gratis dalam **monthly credits**, bukan
jaminan tetap 25 GB storage + 25 GB bandwidth. Cek dashboard dan
https://cloudinary.com/pricing sebelum produksi. `f_auto,q_auto` + kompresi
sekitar 1 MB per foto tetap membantu menghemat credit dan bandwidth.
