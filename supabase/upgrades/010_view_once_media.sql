-- 010: media foto/video sekali lihat untuk DM, disimpan privat di Supabase.
-- Jalankan setelah 009_post_reposters.sql.
begin;

alter table public.messages add column if not exists media_path text;
alter table public.messages add column if not exists media_type text check(media_type in ('image','video'));
alter table public.messages add column if not exists media_once boolean not null default false;
alter table public.messages add column if not exists media_opened_at timestamptz;
create unique index if not exists messages_once_media_path on public.messages(media_path) where media_path is not null;

do $$
declare r record;
begin
  for r in select conname from pg_constraint where conrelid='public.messages'::regclass and contype='c' and pg_get_constraintdef(oid) like '%body%'
  loop execute format('alter table public.messages drop constraint %I',r.conname); end loop;
end $$;
alter table public.messages add constraint messages_content_check check(
  (char_length(trim(body)) between 1 and 2000)
  or (body='' and image_path is not null)
  or (body='' and media_path is not null and media_type is not null and media_once)
);
alter table public.messages add constraint messages_once_shape_check check(
  (media_path is null and media_type is null and not media_once and media_opened_at is null)
  or (media_path is not null and media_type is not null and media_once)
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('chat-once','chat-once',false,26214400,array['image/webp','video/mp4','video/webm'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists chat_once_upload on storage.objects;
drop policy if exists chat_once_read_receiver on storage.objects;
drop policy if exists chat_once_remove_unsent on storage.objects;
create policy chat_once_upload on storage.objects for insert to authenticated with check(
  bucket_id='chat-once'
  and owner_id=(select auth.uid())::text
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists(select 1 from public.conversations c where c.id=((storage.foldername(name))[2])::uuid and (select auth.uid()) in(c.user_a,c.user_b))
  and lower(storage.extension(name)) in ('webp','mp4','webm')
);
create policy chat_once_read_receiver on storage.objects for select to authenticated using(
  bucket_id='chat-once' and exists(
    select 1 from public.messages m join public.conversations c on c.id=m.conversation_id
    where m.media_path=name and (select auth.uid()) in(c.user_a,c.user_b) and m.sender_id<>(select auth.uid())
  )
);
create policy chat_once_remove_unsent on storage.objects for delete to authenticated using(
  bucket_id='chat-once' and owner_id=(select auth.uid())::text
  and not exists(select 1 from public.messages m where m.media_path=name)
);

drop function if exists public.send_message(uuid,text,uuid,text,bigint);
drop function if exists public.send_message(uuid,text,uuid,text,text,boolean,bigint);
create function public.send_message(target uuid,body_value text,request_id uuid,media_value text default null,media_type_value text default null,media_once_value boolean default false,reply_value bigint default null)
returns bigint language plpgsql security definer set search_path='' as $$
declare mid bigint;
begin
 if auth.uid() is null or not exists(select 1 from public.conversations where id=target and auth.uid() in(user_a,user_b)) then raise exception 'Percakapan tidak tersedia'; end if;
 if request_id is null then raise exception 'Request ID tidak valid'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||request_id::text,0));
 select id into mid from public.messages where sender_id=auth.uid() and client_id=request_id;
 if mid is not null then return mid; end if;
 body_value:=coalesce(trim(body_value),''); media_value:=nullif(trim(coalesce(media_value,'')),''); media_type_value:=nullif(trim(coalesce(media_type_value,'')),'');
 if body_value='' and media_value is null then raise exception 'Tulis pesan atau pilih media sekali lihat.'; end if;
 if char_length(body_value)>2000 then raise exception 'Pesan maksimal 2000 karakter.'; end if;
 if media_value is not null then
   if not media_once_value or media_type_value not in ('image','video') or media_value not like auth.uid()::text||'/'||target::text||'/%' then raise exception 'Media sekali lihat tidak valid.'; end if;
   if not exists(select 1 from storage.objects where bucket_id='chat-once' and name=media_value and owner_id=auth.uid()::text) then raise exception 'Media belum terunggah ke Supabase.'; end if;
 elsif media_type_value is not null or media_once_value then raise exception 'Data media tidak lengkap.';
 end if;
 if reply_value is not null and not exists(select 1 from public.messages where id=reply_value and conversation_id=target) then raise exception 'Pesan yang dibalas tidak ditemukan.'; end if;
 perform public.check_rate('message',120,3600);
 insert into public.messages(conversation_id,sender_id,body,client_id,media_path,media_type,media_once,reply_to)
 values(target,auth.uid(),body_value,request_id,media_value,media_type_value,media_once_value,reply_value) returning id into mid;
 update public.conversations set updated_at=now() where id=target;
 return mid;
end $$;

create or replace function public.open_once_media(target bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare row public.messages;
begin
 select m.* into row from public.messages m join public.conversations c on c.id=m.conversation_id
 where m.id=target and m.media_once and m.media_path is not null and auth.uid() in(c.user_a,c.user_b) and m.sender_id<>auth.uid() for update of m;
 if row.id is null then raise exception 'Media tidak tersedia atau sudah dihapus.'; end if;
 update public.messages set media_opened_at=coalesce(media_opened_at,now()) where id=target;
 return jsonb_build_object('path',row.media_path,'type',row.media_type);
end $$;

create or replace function public.finish_once_media(target bigint) returns void language plpgsql security definer set search_path='' as $$
declare row public.messages;
begin
 select m.* into row from public.messages m join public.conversations c on c.id=m.conversation_id
 where m.id=target and m.media_once and m.media_path is not null and m.media_opened_at is not null and auth.uid() in(c.user_a,c.user_b) and m.sender_id<>auth.uid() for update of m;
 if row.id is null then raise exception 'Media tidak tersedia atau belum dibuka.'; end if;
 delete from public.messages where id=target;
 delete from storage.objects where bucket_id='chat-once' and name=row.media_path;
end $$;

revoke execute on function public.send_message(uuid,text,uuid,text,text,boolean,bigint),public.open_once_media(bigint),public.finish_once_media(bigint) from public,anon;
grant execute on function public.send_message(uuid,text,uuid,text,text,boolean,bigint),public.open_once_media(bigint),public.finish_once_media(bigint) to authenticated;

commit;
