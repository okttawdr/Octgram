# SEMUA ADA DI SINI — Octgram dari nol sampai Vercel

Dokumen ini adalah sumber utama setup Octgram versi yang sudah diperbaiki.
Ikuti urutannya. Jangan memakai nilai contoh sebagai secret asli.

## Daftar isi

0. Yang diperbaiki dan tindakan keamanan pertama
1. Arsitektur dan prasyarat
2. Supabase serta urutan SQL yang benar
3. URL Auth dan Google OAuth
4. Cloudinary
5. Agora
6. LiveKit
7. Metered TURN
8. Environment variable
9. Menjalankan dan menguji lokal
10. GitHub dan deploy Vercel
11. Konfigurasi setelah domain produksi tersedia
12. Uji akhir
13. Operasional, kuota, dan troubleshooting
14. Konteks lengkap dari Claude sebelumnya

---

## 0. Yang diperbaiki dan tindakan keamanan pertama

Paket ini memperbaiki masalah penting berikut:

- `server/routes.mjs` sebelumnya memakai `agora` dan `metered` tanpa mengambilnya
  dari context, sehingga endpoint live dan TURN dapat `ReferenceError` saat jalan.
- Instalasi baru kini memperoleh skema live/quota final dari satu file
  `supabase/schema.sql`; 003 tetap prasyarat sebelum 005 untuk database lama.
- Bug SQL `month=month` dan hasil NULL saat baris usage belum ada sudah dihapus.
- Perhitungan berubah dari menit dinding siaran menjadi pencadangan
  **participant-minutes** untuk host dan setiap viewer yang meminta token.
- Alokasi paralel dikunci dengan PostgreSQL advisory transaction lock.
- `reconcile_stream(text)` dicabut dari `PUBLIC`, `anon`, dan `authenticated`;
  hanya `service_role` yang mendapat execute.
- Webhook Agora ditolak jika signing secret kosong atau signature salah.
- Token live dibatasi sesuai waktu reservasi; tombol X host juga mengakhiri live.
- DELETE live hanya bisa menutup room milik host yang terautentikasi.
- Body JSON chunked tanpa `Content-Length` kini dapat dibaca.
- Ditambahkan Node Function Vercel, rewrite API/config, dan fallback SPA.
- `.env` dikeluarkan dari ZIP dan ditambahkan `.gitignore`.
- Keterangan paket Cloudinary/Metered yang sudah usang dikoreksi.

### Wajib: rotasi secret lama

ZIP sumber pernah memuat file `.env`. Walaupun paket hasil ini tidak memuatnya,
anggap semua secret yang pernah ada di ZIP lama sudah terekspos. Sebelum deploy:

1. Supabase: rotate/revoke `service_role` lama dan key lain yang sensitif bila
   tersedia di dashboard. Perbarui aplikasi yang sah.
2. Agora: buat ulang App Certificate bila pernah tercantum; ganti webhook secret.
3. LiveKit: revoke API key lama lalu buat API key/secret baru.
4. Cloudinary: rotate API Secret.
5. Metered: rotate API key.
6. Hapus ZIP lama dari tempat berbagi, history release, dan repository.
7. Pastikan `.env` tidak terlacak: `git ls-files .env` harus tidak menghasilkan apa pun.

Jangan mengirim secret melalui chat, commit, screenshot, atau ZIP. Masukkan
langsung ke `.env` lokal dan Vercel Environment Variables.

---

## 1. Arsitektur dan prasyarat

Alur utama:

- Browser React/Vite → `/api/*` Node → Supabase dengan bearer token pengguna.
- Browser → Supabase Auth dan Realtime secara langsung.
- Browser → Cloudinary secara langsung setelah memperoleh signed upload dari API.
- Browser → Agora atau LiveKit menggunakan token singkat buatan API.
- Browser ↔ browser untuk panggilan 1-on-1; Metered dipakai jika perlu TURN relay.

Siapkan:

- Node.js 22.12 atau lebih baru dan npm.
- Git serta akun GitHub untuk jalur deploy Vercel paling mudah.
- Akun Supabase, Cloudinary, Agora; LiveKit dan Metered sesuai kebutuhan.
- Domain produksi boleh menggunakan domain `*.vercel.app` dahulu.

Extract ZIP lalu masuk ke folder yang berisi `package.json`.

---

## 2. Supabase serta urutan SQL yang benar

### Pilih tepat satu jalur

#### Jalur A — project Supabase benar-benar baru dan kosong

1. Buka https://supabase.com/dashboard dan buat project.
2. Tunggu database selesai dibuat.
3. Buka **SQL Editor → New query**.
4. Buka file lokal `supabase/schema.sql`, salin seluruh isi, tempel, lalu Run.
5. Pastikan transaksi selesai tanpa error.

**Hanya jalankan `supabase/schema.sql`. Jangan lanjut menjalankan 002–005**,
karena final provider/quota sudah berada di bagian akhir schema tersebut.

#### Jalur B — database Octgram lama berbasis `001_octgram.sql`

Backup database lebih dulu. Jangan jalankan `schema.sql`. Di SQL Editor jalankan
satu file per query dan tunggu sukses sebelum lanjut, dengan urutan:

1. `supabase/upgrades/002_harden_existing.sql`
2. `supabase/upgrades/003_livestream.sql`
3. `supabase/upgrades/004_grid_and_caps.sql`
4. `supabase/upgrades/005_agora_streaming.sql`

003 wajib sebelum 005 karena 005 mengubah tabel/fungsi live yang dibuat 003.
Jika project lama sudah sukses sampai nomor tertentu, lanjutkan dari nomor
berikutnya. Jangan mengulang file secara acak pada production; uji di staging.

### Verifikasi database

Di **Table Editor** pastikan ada minimal:

- `profiles`, `posts`, `follows`, `comments`, `messages`, `notifications`
- `live_streams`, `stream_usage`, `stream_reservations`

`stream_usage` dan `stream_reservations` tidak boleh dapat dibaca browser biasa.
Di SQL Editor, pemeriksaan grant berikut harus menunjukkan hanya service role
untuk reconciliation dan role authenticated untuk fungsi pengguna terkait:

```sql
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema='public'
  and routine_name in ('start_live','join_live','end_live','reconcile_stream')
order by routine_name, grantee;
```

### Catat key Supabase

Di **Project Settings → API** atau halaman API Keys, catat:

- Project URL
- publishable key atau legacy `anon` key
- `service_role` key untuk server saja

Publishable/anon key boleh berada di frontend karena RLS yang melindungi data.
`service_role` melewati RLS dan tidak boleh punya prefix `VITE_`.

---

## 3. URL Auth dan Google OAuth

### Supabase URL Configuration

Di **Authentication → URL Configuration**:

- Site URL lokal: `http://localhost:5173`
- Redirect URL lokal:
  - `http://localhost:5173/auth/callback`
  - `http://localhost:5173/auth/recovery`

Setelah Vercel selesai, tambahkan versi production:

- `https://DOMAIN-ANDA/auth/callback`
- `https://DOMAIN-ANDA/auth/recovery`

Untuk Preview Vercel gunakan wildcard hanya bila benar-benar dibutuhkan dan
ikuti sintaks wildcard Supabase terbaru. Production sebaiknya origin eksplisit.

### Google OAuth

1. Buka Google Cloud Console dan pilih/buat project.
2. Konfigurasikan OAuth consent screen, nama aplikasi, email support, dan domain.
3. Buat **OAuth Client ID → Web application**.
4. Authorized JavaScript origins: tambahkan origin lokal dan production.
5. Authorized redirect URI Google harus callback Supabase, bukan callback app:

```text
https://PROJECT_REF.supabase.co/auth/v1/callback
```

6. Salin Google Client ID dan Client Secret ke
   **Supabase → Authentication → Providers → Google**, lalu Enable dan Save.
7. Jangan menaruh Google Client Secret di `.env` frontend/Vercel untuk app ini;
   secret tersebut disimpan di konfigurasi provider Supabase.

Rujukan: https://supabase.com/docs/guides/auth/social-login/auth-google dan
https://supabase.com/docs/guides/auth/redirect-urls

---

## 4. Cloudinary

1. Buat akun/project di https://cloudinary.com/.
2. Dari dashboard catat Cloud name, API Key, dan API Secret.
3. Isi variable Cloudinary pada bagian environment di bawah.
4. Tidak perlu membuat unsigned upload preset; server menandatangani upload.

`VITE_CLOUDINARY_CLOUD_NAME`/Cloud name dapat dilihat publik. API Secret tidak.
Foto post masuk ke `octgram/posts/<user>_<item>`; avatar tetap di bucket Supabase.

Paket gratis Cloudinary saat ini dijelaskan dengan monthly credits. Jangan
mengandalkan klaim lama “25 GB + 25 GB”; lihat https://cloudinary.com/pricing
dan dashboard akun untuk angka aktual.

---

## 5. Agora

1. Buat akun dan project di https://console.agora.io/.
2. Aktifkan App Certificate/security mode untuk project.
3. Catat App ID dan App Certificate.
4. Isi `VITE_AGORA_APP_ID`, `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`.
5. Setelah domain produksi aktif, buat Agora Notifications webhook ke:

```text
https://DOMAIN-ANDA/api/webhooks/agora
```

6. Buat/catat signing secret webhook dan isi `AGORA_WEBHOOK_SECRET` dengan nilai
   yang sama. Jangan mengaktifkan webhook tanpa secret; handler memang akan 401.
7. Pilih event channel lifecycle yang dibutuhkan untuk menandai sesi yang mati
   tidak normal. Nama menu/event dapat berubah; gunakan dokumentasi Console saat ini.

App ID boleh publik. App Certificate dan webhook secret wajib server-only.
RTC menangani media; RTM menangani chat/presence.

Harga/kuota dapat berubah. Pada saat panduan diperbarui, halaman resmi Agora
menyebut 10.000 free participant-minutes/bulan; verifikasi kembali di
https://www.agora.io/en/pricing/agora-rtc/ dan dashboard akun.

---

## 6. LiveKit

LiveKit adalah cadangan; boleh dikosongkan, tetapi saat Agora tidak tersedia
permintaan live akan ditolak jika cadangan ini tidak dikonfigurasi.

1. Buat project di https://cloud.livekit.io/.
2. Catat WebSocket URL (`wss://...livekit.cloud`), API Key, dan API Secret.
3. Isi empat variable LiveKit di bagian environment.

Browser perlu URL publik; API key/secret hanya server. Cek plan aktual di
https://livekit.io/pricing. Panduan ini memakai ambang internal 4.000
participant-minutes, tetapi dashboard provider tetap sumber kebenaran.

---

## 7. Metered TURN

TURN membuat panggilan 1-on-1 lebih andal pada NAT/firewall ketat.

1. Buat akun Open Relay/Metered di https://www.metered.ca/tools/openrelay/.
2. Catat API key dan subdomain (bagian sebelum `.metered.live`).
3. Isi `METERED_API_KEY` dan `METERED_DOMAIN`.

Tanpa Metered, panggilan P2P masih mungkin berhasil tetapi tidak andal di semua
jaringan. Open Relay saat panduan ini diperbarui mengiklankan 20 GB/bulan,
bukan 50 GB; periksa dashboard untuk ketentuan terbaru.

---

## 8. Environment variable

### Lokal

Salin contoh tanpa pernah meng-commit hasilnya:

```bash
cp .env.example .env
```

Isi `.env`:

```dotenv
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=publishable_atau_anon_key
VITE_API_BASE_URL=/api
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=publishable_atau_anon_key
SUPABASE_SERVICE_ROLE_KEY=service_role_server_only
APP_ORIGIN=http://localhost:5173
HOST=127.0.0.1
PORT=3000

VITE_CLOUDINARY_CLOUD_NAME=cloud_name
CLOUDINARY_CLOUD_NAME=cloud_name
CLOUDINARY_API_KEY=api_key
CLOUDINARY_API_SECRET=api_secret

VITE_AGORA_APP_ID=app_id
AGORA_APP_ID=app_id
AGORA_APP_CERTIFICATE=app_certificate
AGORA_WEBHOOK_SECRET=webhook_signing_secret

VITE_LIVEKIT_URL=wss://PROJECT.livekit.cloud
LIVEKIT_URL=wss://PROJECT.livekit.cloud
LIVEKIT_API_KEY=api_key
LIVEKIT_API_SECRET=api_secret

METERED_API_KEY=api_key
METERED_DOMAIN=subdomain_tanpa_dot_metered_live
```

Aturan publik/secret:

| Variable | Browser boleh melihat? | Wajib? |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Ya | Ya |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Function server | Ya |
| `SUPABASE_SERVICE_ROLE_KEY` | Tidak | Untuk webhook reconciliation |
| Cloud name / `VITE_CLOUDINARY_CLOUD_NAME` | Ya | Untuk post foto |
| `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Tidak | Untuk post foto |
| `VITE_AGORA_APP_ID` | Ya | Untuk Agora |
| `AGORA_APP_CERTIFICATE`, webhook secret | Tidak | Untuk token/webhook |
| `VITE_LIVEKIT_URL` | Ya | Jika LiveKit dipakai |
| LiveKit API key/secret | Tidak | Jika LiveKit dipakai |
| Metered API key | Tidak | Agar TURN andal |

`VITE_*` tertanam saat build dan publik. Jangan pernah memberi prefix itu pada secret.

---

## 9. Menjalankan dan menguji lokal

```bash
npm ci
npm run verify
npm run dev
```

Buka `http://localhost:5173`. API lokal berada di port 3000 dan diproxy Vite.
Tes cepat:

```bash
curl http://127.0.0.1:3000/api/health
```

Harus mengembalikan status `ok`. Lalu uji daftar, verifikasi email, login,
upload avatar, buat post, follow, message, panggilan, dan live.

Aturan mulai live adalah minimal 100 followers. Uji dengan data staging yang
realistis; jangan mengubah gate pada production hanya untuk melewati tes.

---

## 10. GitHub dan deploy Vercel

### Push aman ke GitHub

Sebelum commit:

```bash
git status --short
git check-ignore .env
git ls-files .env
```

`git check-ignore .env` harus menunjukkan file diabaikan, sedangkan
`git ls-files .env` harus kosong. Lalu commit dan push project ke repository.

### Import ke Vercel

1. Buka https://vercel.com/new dan Import repository GitHub.
2. Root Directory adalah folder yang berisi `package.json` dan `vercel.json`.
3. Framework Vite/build/output sudah diatur oleh `vercel.json`.
4. Buka Environment Variables dan masukkan semua variable yang relevan.
5. Untuk nilai `VITE_*`, pilih minimal Production; pilih Preview juga jika ingin
   preview berfungsi. Semua server secret juga harus tersedia pada environment
   tempat Function akan diuji.
6. `HOST` dan `PORT` tidak diperlukan di Vercel.
7. Untuk deploy pertama, `APP_ORIGIN` boleh dikosongkan: kode menambahkan
   `VERCEL_URL` otomatis. Setelah domain final diketahui, isi
   `APP_ORIGIN=https://DOMAIN-ANDA` lalu Redeploy.
8. Klik Deploy.

File `api/index.mjs` menjalankan backend sebagai Node Function. `vercel.json`
meneruskan `/api/*`, menyediakan `/config.js` dinamis, dan mengarahkan route
frontend SPA ke `index.html`. Ini bukan deploy static-only.

Dokumentasi: https://vercel.com/docs/functions/runtimes/node-js dan
https://vercel.com/docs/frameworks/frontend/vite

---

## 11. Setelah domain produksi tersedia

Misalkan domain final `https://octgram.example.com`.

1. Set Vercel `APP_ORIGIN=https://octgram.example.com`, lalu Redeploy.
   Beberapa origin dapat dipisahkan koma jika memang diperlukan.
2. Tambahkan URL production Auth di Supabase seperti bagian 3.
3. Tambahkan origin production di Google OAuth client.
4. Daftarkan webhook Agora ke
   `https://octgram.example.com/api/webhooks/agora` dan pastikan secret cocok.
5. Pastikan semua `VITE_*` production benar lalu Redeploy; variable itu dibaca
   saat build.
6. Jika memasang custom domain, tunggu HTTPS aktif sebelum tes kamera/mikrofon.

---

## 12. Checklist uji akhir

- `GET https://DOMAIN/api/health` → 200 dan `status: ok`.
- `GET https://DOMAIN/config.js` → JavaScript, tanpa App Certificate/API Secret.
- Refresh langsung di `/messages`, `/live`, `/profile/...` tidak 404.
- Signup/login/email recovery dan Google OAuth kembali ke domain yang benar.
- Post foto berhasil dan URL berasal dari `res.cloudinary.com`.
- Browser lain menerima message/notification realtime.
- Endpoint TURN mengembalikan ICE servers saat Metered diisi.
- Host <100 followers ditolak memulai live; host eligible dapat mulai.
- Token live tidak pernah dikirim jika quota reservation ditolak.
- Viewer kedua menaikkan reservasi participant-minutes satu kali; refresh user
  yang sama tidak membuat reservasi duplikat.
- Tombol X/Akhiri Live menutup status; LiveKit room dihapus jika digunakan.
- Webhook tanpa signature atau secret salah menghasilkan 401.
- Tidak ada `.env`, secret, `node_modules`, atau `dist` tak sengaja dalam ZIP/Git.

---

## 13. Operasional, kuota, dan troubleshooting

### Arti perlindungan kuota versi ini

Provider menagih berdasarkan peserta, bukan hanya jam host. Contoh: host + 9
viewer selama 10 menit mendekati 100 participant-minutes, bukan 10. Maka:

- host mencadangkan jatah maksimal 90 menit saat live dibuat;
- viewer mencadangkan sisa durasi saat token pertama kali diminta;
- reservasi user/stream unik, sehingga refresh tidak menggandakan;
- transaksi alokasi dikunci agar request paralel tidak melewati ambang;
- jatah dicatat di muka dan tidak dikembalikan jika peserta pergi lebih cepat.

Model ini sengaja konservatif. `stream_usage` adalah ledger aplikasi, bukan
sinkronisasi invoice provider. Pemakaian dari aplikasi/project lain, perubahan
plan, pembulatan provider, atau koneksi abnormal tetap harus dipantau di dashboard.
Ambang 8.900/4.000 memberi headroom tetapi **bukan jaminan hard spending cap**.
Pasang billing alert/spending protection provider jika tersedia.

### Jika live selalu “tidak tersedia”

- Pastikan set Agora lengkap: App ID + Certificate. Jika salah satu kosong,
  server menganggap Agora tidak tersedia.
- Pastikan LiveKit lengkap jika diharapkan sebagai fallback.
- Periksa Function logs Vercel dan tabel internal melalui SQL Editor sebagai admin.
- Jangan tampilkan angka quota ke UI pengguna; pesan generik memang disengaja.

### Jika API 500 di Vercel

- Periksa semua environment variables dan Redeploy setelah mengubah `VITE_*`.
- Pastikan Root Directory benar dan `api/index.mjs` ikut terdeploy.
- Coba `/api/health`; lalu lihat Function logs, bukan hanya console browser.

### Jika OAuth kembali ke localhost

Perbaiki Site URL/Redirect URLs Supabase dan Authorized origins Google. Callback
Google tetap callback Supabase `/auth/v1/callback`.

### Jika webhook 401

Pastikan Agora mengirim signature HMAC dan `AGORA_WEBHOOK_SECRET` sama persis.
Jangan mengosongkan secret untuk “memperbaiki” 401; itu akan tetap ditolak.

### Jika build berubah setelah update dependency

Gunakan `npm ci`, commit `package-lock.json`, jalankan `npm run verify`, dan uji
Preview sebelum production. Jangan mengedit generated `dist`.

---

## 14. Konteks lengkap dari Claude sebelumnya

Bagian ini disimpan sebagai arsip konteks yang diberikan pengguna. Klaim di
dalamnya bukan otomatis kondisi final; koreksi teknisnya ada di bagian 0 dan 13.

> Cukup akurat (003 tetap prasyarat sebelum 005). Sekarang final build & packaging\:Sukses. Sekarang paket final:**Selesai.** Ringkasan lengkap yang sudah dikerjakan (typecheck + build lulus):
>
> **1. Sistem kuota otomatis Agora/LiveKit** — bagian paling kritis:
>
> - Agora dipakai duluan, berhenti otomatis di **8.900/10.000 menit**
> - Kalau sudah kena batas itu, otomatis pindah ke LiveKit, berhenti di **4.000/5.000 menit**
> - Kalau keduanya habis, user cuma lihat "Live sedang tidak tersedia" — **tidak ada info kuota bocor ke UI**
> - Tiap siaran dapat jatah waktu dari server, klien auto-stop sendiri saat habis
> - Webhook `/api/webhooks/agora` sebagai jaring pengaman untuk siaran yang mati tak wajar (pakai service-role key, aman)
>
> **2. Provider sesuai tabel kamu:**
>
> - Live streaming → Agora (utama) + LiveKit (cadangan) ✅
> - Chat & viewer count live → Agora RTM (pengganti Agora Chat SDK — lebih simpel, satu kredensial dengan RTC, saya jelaskan alasannya di `AGORA.md`)
> - Video call 1-on-1 → WebRTC + Supabase Realtime (signaling) + Metered.ca (TURN) — fitur baru, ada tombol telepon di halaman Pesan + notifikasi panggilan masuk global
> - Media feed → Cloudinary (sudah dari sebelumnya)
>
> **3. Desain** — palet warna diganti dari gradasi ungu-biru-cyan generik jadi satu aksen warna ember/terracotta yang lebih tegas, plus logomark baru (bukan ikon kamera generik lagi).
>
> **4. Panduan setup dari nol** ada di `SETUP.md` (konsolidasi semua provider), plus `AGORA.md` dan `LIVESTREAM.md` (sudah ditandai sebagai cadangan).
>
> ---
>
> ### Yang saya sederhanakan (jujur, biar tidak menjanjikan lebih dari yang benar-benar teruji):
>
> - **Auto-stop bukan "tendang paksa" dari server** — mekanismenya timer di klien + gerbang di server + webhook cadangan. Untuk kondisi normal ini cukup andal; skenario ekstrem (matikan paksa app di detik terakhir sebelum limit) ditutup webhook.
> - **Redesign** adalah refresh warna+logo yang berarti, bukan rombak total setiap komponen — mengingat skalanya, ini titik yang paling efisien untuk mengubah kesan "generic AI app" tanpa mempertaruhkan kestabilan seluruh UI.
> - Chunk halaman Live \~1MB (gzip) karena gabung Agora RTC+RTM+LiveKit — hanya kebuka pas buka halaman Live, tidak bebani halaman lain, tapi masih bisa dioptimasi lebih lanjut kalau perlu.

### Koreksi terhadap konteks lama

- 003 memang tetap prasyarat 005 untuk jalur upgrade, tetapi project baru cukup
  menjalankan `schema.sql` versi paket ini.
- “Menit” harus dipahami participant-minutes. Versi lama menghitung durasi host
  dan dapat jauh lebih kecil dari tagihan aktual; versi ini memakai reservasi per peserta.
- Webhook tanpa secret sebelumnya tetap diproses; sekarang wajib terverifikasi.
- Webhook menutup status database, bukan otomatis menjamin provider telah memutus
  seluruh media. Karena itu klaim “skenario ekstrem ditutup webhook” terlalu kuat.
- Vercel static-only sebelumnya memang tidak cukup; paket ini sekarang memiliki
  Node Function dan rewrite full-stack.
- Angka free tier bukan kontrak permanen. Selalu cocokkan dengan dashboard resmi.

Selesai. Setelah checklist bagian 12 lulus, project siap dipakai bertahap—mulai
dari Preview/staging sebelum mengarahkan pengguna production.
