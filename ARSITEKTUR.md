# Arsitektur Octgram

## Batas komponen

- `src/`: React UI, domain types, auth service, API client, image worker, Cloudinary upload, dan Realtime subscription.
- `server/`: HTTP server Node, auth middleware, validation, route mapping, repository Supabase, static serving, dan security headers.
- `supabase/schema.sql`: installer database kosong.
- `supabase/upgrades/`: perubahan untuk database lama.
- `tests/`: pengujian HTTP, routing, auth/config, SQL/RLS, dan WebP.

## Alur request data

1. Browser memperoleh Supabase session melalui email/password atau Google PKCE.
2. `src/services/api.ts` memasang access token pada header Bearer.
3. `server/auth.mjs` memvalidasi token melalui Supabase Auth.
4. `server/supabase.mjs` membuat client request-scoped dengan token pengguna.
5. Repository menjalankan query/RPC. PostgreSQL tetap melihat `auth.uid()` pengguna asli.
6. Grant, RLS, constraint, dan RPC memutuskan akses akhir.

## Pengecualian yang disengaja

- Auth langsung: SDK browser mengelola PKCE, refresh, dan session lifecycle.
- Upload langsung: post menuju Cloudinary dengan signature server; avatar menuju Supabase Storage.
- Realtime langsung: WebSocket messages/notifications lebih efisien dari browser. Data awal dan reconnect tetap disinkronkan melalui Node API.

## API

- `GET /api/health`
- `GET/PATCH /api/me`
- `GET /api/profiles`, `GET /api/profiles/:username`
- `GET /api/feed`
- `GET/POST /api/posts`, `GET /api/posts/:id`
- `GET/POST /api/posts/:id/comments`
- `POST /api/posts/:id/like`, `POST /api/posts/:id/bookmark`
- `POST /api/follows/:id`
- `GET/PATCH /api/notifications`
- `GET/POST /api/conversations`
- `GET /api/conversations/:id`
- `GET/POST /api/conversations/:id/messages`
- `GET/POST /api/live`, `GET/DELETE /api/live/:id`
- `GET /api/calls/turn-credentials`
- `POST /api/uploads/sign`, `DELETE /api/uploads`
- `POST /api/webhooks/agora` (publik, tetapi wajib signature valid)

Semua endpoint selain health membutuhkan Bearer token. Mutation memeriksa origin dan body JSON dibatasi 256 KiB.

## Prinsip keamanan

- Request pengguna tetap user-scoped. `service_role` hanya dipakai handler webhook
  bertanda tangan untuk memanggil `reconcile_stream`; key tidak pernah ke browser.
- Tidak ada secret Google di source.
- Input di-whitelist pada route, lalu divalidasi ulang oleh database.
- Helper `security definer` memiliki `search_path=''` dan execute privilege dicabut dari client.
- RPC publik hanya diberikan kepada role `authenticated`.
- Upload post ditandatangani server dan path Cloudinary divalidasi dengan UID.
