# Audit dan perbaikan Octgram 2.1

## Ringkasan audit

Audit mencakup router React, feed, profil, composer, pesan, live streaming, Node API, repository Supabase, RLS, RPC, storage, dan pengujian otomatis.

| Masalah | Penyebab utama | Perbaikan |
| --- | --- | --- |
| React error #310 | `useLoad` dipanggil di cabang rute dalam `Shell`, sehingga urutan hook berubah | Halaman likes, followers, following, dan monitoring dipindahkan ke komponen dengan urutan hook tetap |
| Daftar followers/following gagal | Perpindahan rute memicu pelanggaran aturan hook sebelum data selesai dimuat | Halaman daftar sosial baru memakai komponen mandiri dan state stabil |
| Admin tetap terkunci saat live | UI hanya memeriksa jumlah pengikut. Pemeriksaan database juga terlalu bergantung pada claim email | UI mengenali dua email admin. RPC baru memeriksa email Auth dan username profil |
| Panel admin tidak menampilkan data | Nama properti UI tidak sama dengan hasil `db_stats()` | Dashboard memakai field aktual dan menampilkan metrik serta rincian sistem |
| Menu tiga titik terpotong atau tidak dapat diklik | Menu berada di stacking context kartu feed yang memiliki transform dan animasi | Menu dipindahkan ke portal global dengan action sheet desktop dan mobile |
| Hapus postingan gagal | Route `DELETE /api/posts/:id` belum ada | Route ditambahkan dan dilindungi RPC pemilik postingan |
| Edit caption tidak dapat dikosongkan | Caption kosong dikirim sebagai `null`, lalu SQL menganggapnya tidak perlu diperbarui | String kosong sekarang dikirim sebagai perubahan valid |
| Kolaborator tidak tersimpan | Route tidak meneruskan `collabUsername` | Composer, validasi API, repository, dan RPC sudah terhubung |
| Repost tidak responsif | Interaksi lama memakai dialog dan daftar reposter belum mempunyai endpoint lengkap | Repost menjadi toggle satu klik dengan optimistic update dan bubble avatar |
| Media DM tidak konsisten | Pengiriman gambar permanen bergantung pada alur Cloudinary khusus chat | Pengiriman media baru memakai bucket Supabase privat dan mode sekali lihat |

## Kontrol akses media sekali lihat

1. Pengirim mengunggah foto WebP atau video MP4/WebM ke bucket privat `chat-once`.
2. Jalur objek wajib mengikuti akun pengirim dan percakapan yang sah.
3. Pengirim dapat melihat status terkirim, tetapi tidak memiliki izin baca objek.
4. Penerima membuka media melalui URL bertanda tangan dengan masa berlaku singkat.
5. Setelah penerima menutup viewer atau video selesai, RPC menghapus baris pesan dan objek storage dalam satu transaksi.
6. RLS mencegah akun di luar percakapan membaca atau menghapus media.

## Perilaku postingan

- Tombol aksi tersusun: suka, komentar, repost, simpan.
- Tombol tiga titik berada di kanan atas.
- Pemilik melihat edit, daftar likes, kolaborator, bagikan, arsip/pulihkan, dan hapus.
- Pengguna lain hanya melihat informasi akun, daftar likes, kolaborator, dan bagikan.
- Waktu posting berada di bagian paling bawah kartu.
- Batas akun tetap tersembunyi dari UI: 24 postingan untuk akun dengan maksimal 10 pengikut dan 30 untuk akun dengan lebih dari 10 pengikut.

## Hasil verifikasi

- 47 pengujian otomatis lulus.
- TypeScript lulus tanpa error.
- Build produksi Vite selesai.
- Tes database membuktikan pengirim tidak dapat membuka media sekali lihat.
- Tes database membuktikan penerima dapat membuka lalu menghapus pesan dan objek media.
- Tes migrasi memvalidasi upgrade 002 sampai 012 secara berurutan.

Peringatan ukuran chunk Live tetap muncul karena SDK Agora dan LiveKit berukuran besar. Halaman Live sudah dimuat secara lazy, sehingga chunk tersebut hanya diambil ketika pengguna membuka fitur Live.
