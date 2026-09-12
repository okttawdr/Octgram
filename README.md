# Octgram

Octgram adalah aplikasi sosial foto berbasis React/Vite, Node.js API, dan
Supabase. Foto post diunggah langsung ke Cloudinary. Avatar dan media DM sekali
lihat memakai Supabase Storage. Live memakai Agora RTC sebagai utama dan LiveKit
sebagai cadangan. Chat dan kehadiran penonton live memakai Supabase Realtime.
Panggilan 1-on-1 memakai WebRTC, Supabase Realtime, dan TURN Metered.

## Mulai

Baca **`semua_ada_disini.md`**. Itu adalah panduan kanonis dari project kosong
sampai deploy full-stack Vercel, termasuk urutan SQL dan daftar environment
variable.

```bash
npm ci
cp .env.example .env
npm run dev
```

Untuk verifikasi:

```bash
npm run verify
```

## Supabase

- Project baru dan kosong: jalankan hanya `supabase/schema.sql`.
- Project Octgram lama berbasis migration 001: backup, lalu jalankan seluruh
  file `supabase/upgrades/002` sampai `012` secara berurutan.
- Jika beberapa upgrade sudah pernah berhasil, lanjutkan dari nomor berikutnya;
  jangan menjalankan `schema.sql` pada database lama.

## Deploy

`vercel.json` dan `api/index.mjs` membuat deployment Vercel full-stack: Vite
dibangun ke `dist`, route SPA diarahkan ke `index.html`, `/api/*` berjalan
sebagai Node Function, dan `/config.js` dihasilkan dari secret server.

Backend mandiri tetap didukung:

```bash
npm run build
npm start
```

## Keamanan

`.env` sengaja tidak disertakan dan diblokir oleh `.gitignore`. Jangan pernah
menaruh App Certificate, API Secret, `service_role`, atau webhook secret pada
variable `VITE_*`, `public/config.js`, Git, maupun ZIP. Webhook Agora wajib
memiliki signature secret agar diproses.

Dokumen tambahan: `AGORA.md`, `LIVESTREAM.md`, `CLOUDINARY.md`,
`GOOGLE-AUTH.md`, `ARSITEKTUR.md`, `DEPLOY-PERBAIKAN-2.1.md`, dan `TESTING.md`.
