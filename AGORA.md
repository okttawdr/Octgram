# Agora untuk live utama

Isi `VITE_AGORA_APP_ID`, `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`, dan—jika
webhook diaktifkan—`AGORA_WEBHOOK_SECRET`. App Certificate dan webhook secret
hanya boleh berada di server/Vercel Environment Variables.

Octgram memakai Agora RTC untuk media dan RTM untuk chat/presence. Setiap host
dan viewer adalah peserta yang dapat memengaruhi pemakaian provider. Karena itu
versi ini mencadangkan participant-minutes saat token dikeluarkan, bukan sekadar
menghitung lama siaran host.

Ambang aplikasi saat ini 8.900 participant-minutes/bulan. Angka paket dapat
berubah; cocokkan dengan https://www.agora.io/en/pricing/agora-rtc/ dan dashboard
akunmu sebelum go-live. Ambang internal bukan pengganti spending limit provider.

Webhook: arahkan Agora Notifications ke
`https://DOMAIN/api/webhooks/agora`. Handler menolak event jika secret kosong
atau tanda tangan salah. RPC `reconcile_stream` hanya diberikan kepada
`service_role`, bukan browser. Webhook menandai database selesai; token TTL dan
timer klien membatasi sesi, tetapi ini bukan pemutus paksa media dari server.

Panduan klik-per-klik dan penjelasan batasan ada di `semua_ada_disini.md`.
