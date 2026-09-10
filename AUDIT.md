# Audit Teknis

## Kondisi awal

- Build gagal dengan puluhan error TypeScript.
- `App.tsx` mengimpor ekspor yang tidak tersedia dari `Auth.tsx`.
- Tiga Supabase client mempunyai kontrak dan konfigurasi berbeda.
- Proyek Vite membaca `process.env` dan memakai opsi auth client yang tidak valid.
- Helper `date`, `photo`, dan `go` menjadi async walau dipakai sinkron oleh JSX.
- Domain types tidak cocok dengan payload RPC/database.
- OAuth memakai callback yang tidak ditangani konsisten dan memaksa offline consent tanpa kebutuhan Google API.
- Data sosial diakses langsung dari banyak komponen, sehingga frontend, auth, query, dan UI saling terikat.
- Test SQL lulus tetapi build frontend tidak dijalankan sebagai bagian kontrak.
- Arsip menyertakan `.env`, kredensial publik proyek tertentu, `node_modules` Windows, dan `dist` lama.

## Perbaikan

- Satu client Supabase browser dan satu auth service PKCE.
- Node BFF untuk seluruh query dan mutation sosial.
- Repository request-scoped meneruskan bearer identity ke RLS.
- Route validation, field whitelist, body limit, origin check, security headers, dan error envelope.
- Tipe domain, config resolver, API client, callback/recovery flow, dan static SPA server dipisahkan.
- SQL fresh-install baru dan upgrade database lama.
- Trigger profil mendukung metadata `full_name` serta `name` dari Google.
- Tutorial Google Cloud dan Supabase diperbarui.
- `.env`, `node_modules`, cache, `.git`, dan build usang dikeluarkan dari ZIP final.

## Catatan build lingkungan audit

TypeScript dapat diverifikasi. Vite build pada salinan awal Linux membutuhkan `npm ci` karena arsip lama membawa optional Rollup binary Windows. Instalasi bersih memilih binary yang sesuai sistem operasi; ZIP final sengaja tidak membawa `node_modules`.
