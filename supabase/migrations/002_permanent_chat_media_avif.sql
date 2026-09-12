-- 002_permanent_chat_media_avif.sql
-- Mengubah media chat dari "sekali lihat lalu terhapus" menjadi PERMANEN,
-- dan menambah dukungan format AVIF (kompresi jauh lebih kecil dari WebP).
--
-- Catatan desain:
--  * Kolom `media_once` / fungsi `open_once_media` / `finish_once_media` TIDAK dihapus
--    supaya tidak merusak data & baris pesan lama — hanya sudah tidak dipakai lagi
--    oleh alur kirim yang baru (client tidak lagi memanggil endpoint open/finish,
--    dan objek storage tidak pernah dihapus lagi setelah dilihat).
--  * Yang berubah: kebijakan (RLS) storage `chat-once` kini mengizinkan KEDUA peserta
--    percakapan membaca media tersebut kapan saja & berkali-kali, bukan hanya
--    penerima dan hanya satu kali.
--  * Bucket `chat-once` sekarang juga menerima mime type `image/avif`.

-- 1) Izinkan file AVIF di bucket chat-once
update storage.buckets
set allowed_mime_types = array['image/avif','image/webp','video/mp4','video/webm']
where id = 'chat-once';

-- 2) Upload policy: terima ekstensi avif juga
drop policy if exists chat_once_upload on storage.objects;
create policy chat_once_upload on storage.objects for insert to authenticated
  with check(
    bucket_id = 'chat-once'
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists(
      select 1 from public.conversations c
      where c.id = ((storage.foldername(name))[2])::uuid
        and (select auth.uid()) in (c.user_a, c.user_b)
    )
    and lower(storage.extension(name)) in ('avif','webp','mp4','webm')
  );

-- 3) Read policy: media permanen, kedua peserta boleh baca kapan saja
drop policy if exists chat_once_read_receiver on storage.objects;
create policy chat_once_read_receiver on storage.objects for select to authenticated
  using(
    bucket_id = 'chat-once'
    and exists(
      select 1 from public.messages m
      join public.conversations c on c.id = m.conversation_id
      where m.media_path = name
        and (select auth.uid()) in (c.user_a, c.user_b)
    )
  );

-- 4) Kebijakan hapus untuk upload yang belum terkirim tetap sama (tidak menyentuh
--    media yang sudah terpasang ke pesan, jadi media yang sudah terkirim aman permanen).
