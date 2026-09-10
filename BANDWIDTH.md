# Bandwidth dan penggunaan gratis

## Keputusan implementasi

| Bagian              | Penghematan                                                                  |
| ------------------- | ---------------------------------------------------------------------------- |
| Hosting             | Node menyajikan build Vite dan API pada satu origin                          |
| Foto post           | Browser → Cloudinary setelah signed upload dari API                          |
| Avatar              | Browser → Supabase Storage                                                    |
| Pengolahan          | Worker browser + delivery transform Cloudinary `f_auto,q_auto`               |
| Default foto        | Ladder WebP sampai maksimal sekitar 1 MiB                                    |
| Carousel            | Hanya gambar aktif memiliki elemen img, gambar lain tidak dipreload          |
| Gambar feed         | Lazy loading native, dimensi disediakan untuk kestabilan layout              |
| Feed                | API Node memanggil satu RPC per halaman, 10 postingan, keyset ID             |
| Komentar/notifikasi | Masing-masing 20 baris per halaman, dibaca saat dibuka                       |
| Chat                | 30 pesan per halaman dan satu subscription percakapan aktif                  |
| Tab tersembunyi     | Subscription chat dilepas dan disambungkan kembali saat tab aktif            |
| Notifikasi          | Subscription hanya saat halaman notifikasi dibuka, tanpa polling global       |
| Kode                | Route splitting; halaman Live dimuat hanya ketika dibuka                     |
| Aset                | Nama file dengan hash, cache immutable 1 tahun                               |
| config.js           | no-store agar perubahan koneksi segera berlaku                               |
| Database            | Indeks pemilik, pasangan follow, post, percakapan, dan cursor                |

Isi chat tidak disimpan ke localStorage. Supabase Auth menyimpan sesi browser agar pengguna tetap login. Preferensi tema tersimpan secara lokal.

## Batas internal

- 8 foto per postingan di bawah 100 followers; 20 jika minimal 100 followers.
- 20 MiB per file sumber, 40 MP maksimal setelah decode.
- Sekitar 1 MiB per hasil WebP post; avatar mengikuti batas bucket Storage.
- 10 postingan per pengguna per jendela 24 jam.
- 40 tindakan follow/unfollow per pengguna per jam.
- 180 tindakan like/unlike, 60 komentar, 30 pembukaan percakapan, dan 120 pesan per pengguna per jam.
- Pemeriksaan kapasitas 250 objek Supabase Storage per pengguna berlaku untuk avatar/objek yang masih memakai bucket tersebut.

Rate limiting di database tidak dapat mencegah seluruh biaya request yang ditolak. Kuota per pengguna juga tidak membatasi total pengguna baru. Mulailah dengan komunitas kecil dan awasi Usage dashboard. Gunakan kontrol signup/anti-abuse Supabase bila akses dibuka luas.

Unggahan gagal dapat dicoba ulang. Postingan dan pesan memakai request UUID agar retry setelah respons hilang tidak membuat duplikat. Penutupan browser mendadak bisa meninggalkan orphan Cloudinary; audit folder `octgram/posts` secara berkala.

## Estimasi ilustratif, bukan hasil benchmark

Jika rata-rata hasil foto **180 KB**, maka 1.000 unduhan foto baru memakai sekitar **180 MB** transfer, sebelum overhead. Sebanyak 10.000 unduhan memakai sekitar **1,8 GB**. Angka 180 KB hanya asumsi perencanaan, bukan ukuran yang dijamin encoder. Detail, noise, resolusi, alpha, dan mode lossless memengaruhi hasil.

Cache browser bisa mengurangi unduhan ulang pada perangkat sama. Pengunjung baru tetap mengunduh file. Cache CDN tidak berarti seluruh egress Supabase gratis. Egress dapat berasal dari Auth, database, Storage dan Realtime.

Untuk menekan penggunaan lebih jauh tanpa mengubah source, pilih dimensi 1080 px saat upload. Gunakan mode lossless hanya untuk gambar yang membutuhkan ketelitian piksel, karena dapat lebih besar.

## Gratis tetap memiliki kuota

Gunakan paket Free sesuai kebutuhan dan pantau batas terbaru di dashboard. Tidak ada janji bahwa aplikasi publik dengan trafik berapa pun akan selamanya tanpa biaya. SMTP publik juga memiliki kuota dan persyaratan provider tersendiri. Jangan aktifkan add-on berbayar yang tidak diperlukan.

Rujukan resmi yang diperiksa saat penyusunan:

- [Supabase pricing](https://supabase.com/pricing)
- [Supabase egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress)
- [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp)

Kuota dan ketentuan provider dapat berubah. Ikuti angka paket yang terlihat pada akun Anda saat deployment.
