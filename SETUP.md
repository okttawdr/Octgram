# Setup Octgram

Panduan kanonis yang lengkap ada di **`semua_ada_disini.md`**. Dokumen itu
mencakup rotasi secret, pemilihan dan urutan SQL Supabase, Google OAuth,
Cloudinary, Agora, LiveKit, Metered, pengujian lokal, serta deploy full-stack
ke Vercel. Ikuti dari bagian 0 sampai checklist akhir tanpa melompati langkah.

Ringkasnya:

- Supabase baru/kosong: jalankan hanya `supabase/schema.sql`.
- Database Octgram lama berbasis 001: jalankan berurutan 002 → 003 → 004 → 005.
- Jangan pernah memasukkan `.env` ke Git atau ZIP.
- Jalankan `npm ci`, `npm run verify`, lalu deploy menggunakan `vercel.json`.
