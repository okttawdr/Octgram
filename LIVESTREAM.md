# LiveKit sebagai cadangan

LiveKit dipakai jika Agora tidak tersedia menurut konfigurasi/ambang internal.
Isi `VITE_LIVEKIT_URL`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, dan
`LIVEKIT_API_SECRET`. API key/secret hanya boleh ada di server.

Versi ini mencadangkan sisa durasi untuk setiap peserta sebelum token dibuat,
mengunci alokasi bersamaan di PostgreSQL, memberi token TTL terbatas, dan
menghapus room LiveKit ketika host mengakhiri live. Upgrade 012 mengunci host
ke perangkat yang memulai siaran. Chat dan presence memakai Supabase Realtime
yang sama pada Agora dan LiveKit. Ambang internal saat ini
4.000 participant-minutes/bulan; verifikasi paket aktual di
https://livekit.io/pricing sebelum produksi.

Untuk instalasi baru fungsi final sudah ada di `supabase/schema.sql`. Untuk
database lama, 003 membuat fitur live dasar, 005 memasang provider/quota, dan
012 memasang lifecycle serta penguncian perangkat. Jalankan sesuai urutan.

Panduan lengkap ada di `semua_ada_disini.md`.
