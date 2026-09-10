# Memasang Login Google

Octgram memakai Supabase Auth dengan Authorization Code + PKCE. Google Client Secret hanya disimpan pada Supabase Dashboard, bukan di frontend atau backend Node.

Gunakan nilai berikut sepanjang panduan:

- App development origin: `http://localhost:5173`
- App production origin: `https://octgram.domain-anda.com`
- App callback development: `http://localhost:5173/auth/callback`
- App callback production: `https://octgram.domain-anda.com/auth/callback`
- Supabase callback: `https://PROJECT_REF.supabase.co/auth/v1/callback`

`PROJECT_REF` adalah bagian awal URL proyek Supabase.

## 1. Konfigurasi URL Supabase

1. Buka Supabase Dashboard → Authentication → URL Configuration.
2. Isi Site URL dengan origin production, tanpa slash akhir:

```text
https://octgram.domain-anda.com
```

3. Tambahkan Redirect URLs berikut secara eksplisit:

```text
http://localhost:5173/auth/callback
http://localhost:5173/auth/recovery
https://octgram.domain-anda.com/auth/callback
https://octgram.domain-anda.com/auth/recovery
```

Jangan memakai wildcard pada production bila daftar domain sudah diketahui.

## 2. Buat Google Cloud project

1. Buka [Google Cloud Console](https://console.cloud.google.com/).
2. Pilih proyek yang ada atau buat proyek khusus Octgram.
3. Buka Google Auth Platform.

## 3. Isi Branding, Audience, dan Data Access

1. Branding: isi App name, support email, logo bila ada, homepage, privacy policy, terms, dan authorized domain production.
2. Audience:
   - Internal hanya untuk akun Google Workspace organisasi sendiri.
   - External untuk pengguna umum.
   - Saat status Testing, tambahkan setiap akun pada Test users.
3. Data Access: pertahankan scope minimum:

```text
openid
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/userinfo.profile
```

Tambahkan `openid` secara manual bila belum ada. Octgram tidak membutuhkan scope Google Drive, Calendar, Contacts, atau akses offline.

## 4. Buat OAuth client

1. Google Auth Platform → Clients → Create client.
2. Application type: Web application.
3. Name: `Octgram Web`.
4. Authorized JavaScript origins:

```text
http://localhost:5173
https://octgram.domain-anda.com
```

Origin tidak boleh berisi path, query, atau slash akhir.

5. Authorized redirect URIs:

```text
https://PROJECT_REF.supabase.co/auth/v1/callback
```

Nilai ini harus sama persis dengan callback yang ditampilkan pada halaman provider Google di Supabase. Jangan memasukkan `/auth/callback` milik Octgram ke kolom redirect URI Google; Google kembali ke Supabase terlebih dahulu.

6. Klik Create. Salin Client ID dan Client Secret.

## 5. Aktifkan provider Google di Supabase

1. Supabase Dashboard → Authentication → Providers → Google.
2. Aktifkan Google.
3. Tempel Client ID dan Client Secret dari langkah sebelumnya.
4. Simpan.

Client Secret berhenti di dashboard ini. Jangan menaruhnya di `.env`, Git, Node backend, atau `public/config.js`.

## 6. Uji development

```bash
cp .env.example .env
npm ci
npm run dev
```

1. Buka `http://localhost:5173`.
2. Klik Lanjutkan dengan Google.
3. Setelah memilih akun, alur normal adalah Google → Supabase callback → `http://localhost:5173/auth/callback` → beranda.
4. Pastikan tabel `auth.users` bertambah dan `public.profiles` otomatis memiliki baris dengan nama Google.
5. Pastikan `GET /api/me` berhasil setelah login.

## 7. Aktifkan production

1. Deploy aplikasi di HTTPS.
2. Set `APP_ORIGIN` ke origin production yang sama persis.
3. Pastikan origin dan callback production sudah ada di Google serta Supabase.
4. Jika Audience masih Testing, hanya Test users yang dapat login.
5. Setelah branding, domain, privacy policy, dan data-access siap, ubah publishing status sesuai kebutuhan. Scope minimum biasanya tidak memerlukan verifikasi sensitif, tetapi branding/domain dapat tetap menjalani pemeriksaan Google.

## 8. Troubleshooting

### `redirect_uri_mismatch`

- Bandingkan karakter per karakter Authorized redirect URI Google dengan callback provider Supabase.
- Nilai Google harus berbentuk `https://PROJECT_REF.supabase.co/auth/v1/callback`.
- Periksa proyek Google yang sedang aktif dan OAuth client yang dipakai Supabase.

### `requested path is invalid` atau kembali ke login

- Tambahkan `/auth/callback` ke Supabase Redirect URLs.
- Pastikan protokol, domain, port, dan path sama persis.
- Bersihkan site data, lalu coba ulang dalam satu browser; verifier PKCE disimpan pada browser yang memulai login.

### `access_denied`

- Tambahkan akun ke Test users atau publikasikan aplikasi External.
- Periksa Audience Internal bila akun berasal dari luar organisasi.

### Profil tidak terbentuk

- Jalankan `supabase/schema.sql` sebelum membuat akun pertama.
- Periksa trigger `on_auth_user_created` dan function `handle_new_user`.
- Untuk database lama, jalankan upgrade yang disediakan.

### Production gagal tetapi localhost berhasil

- Set Site URL dan Redirect URLs production di Supabase.
- Tambahkan origin production di Google Authorized JavaScript origins.
- Set `APP_ORIGIN` tanpa slash akhir dan redeploy Node.
- Gunakan HTTPS; Google membatasi origin production yang tidak aman.

Referensi resmi: [Supabase Google Auth](https://supabase.com/docs/guides/auth/social-login/auth-google), [Google Auth consent configuration](https://developers.google.com/workspace/guides/configure-oauth-consent), dan [Google OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies).
