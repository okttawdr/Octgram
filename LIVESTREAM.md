# LiveKit sebagai cadangan

LiveKit dipakai jika Agora tidak tersedia menurut konfigurasi/ambang internal.
Isi `VITE_LIVEKIT_URL`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, dan
`LIVEKIT_API_SECRET`. API key/secret hanya boleh ada di server.

Versi ini mencadangkan sisa durasi untuk setiap peserta sebelum token dibuat,
mengunci alokasi bersamaan di PostgreSQL, memberi token TTL terbatas, dan
menghapus room LiveKit ketika host mengakhiri live. Ambang internal saat ini
4.000 participant-minutes/bulan; verifikasi paket aktual di
https://livekit.io/pricing sebelum produksi.

Untuk instalasi baru fungsi final sudah ada di `supabase/schema.sql`. Untuk
database lama, 003 membuat fitur live dasar dan 005 memasang provider/quota
final; 003 tetap wajib dijalankan sebelum 005.

Panduan lengkap ada di `semua_ada_disini.md`.
