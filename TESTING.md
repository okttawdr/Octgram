# Pengujian

```bash
npm ci
npm test
npm run typecheck
npm run build
```

Test otomatis mencakup konfigurasi publik, URL OAuth, safe redirect, routing API, bearer auth, origin/body limits, static SPA fallback, fresh database schema, legacy database upgrade, grants, RLS, RPC, pagination, idempotensi, rate limit, kontrak worker WebP, provider live, signature webhook, dan rewrite Vercel.

Pengujian otomatis tidak dapat menggantikan integrasi dengan akun layanan nyata. Setelah setup, uji dua akun pada browser berbeda:

1. Google login dan email/password.
2. Profil otomatis dan username unik.
3. Follow, feed, like, bookmark, komentar, mention, dan notifikasi.
4. Chat dua arah serta reconnect tab.
5. Upload foto hingga batas follower, retry, file besar, serta MIME yang tidak didukung.
6. Akses post/profile melalui URL langsung untuk memeriksa SPA fallback.
7. Request tanpa bearer token harus mendapat 401.
8. Agora/LiveKit dengan dua browser, auto-stop, TURN, dan webhook bertanda tangan.
