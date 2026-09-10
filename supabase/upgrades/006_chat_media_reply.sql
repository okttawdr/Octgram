-- 006: lampiran gambar chat + kutipan balasan (swipe-to-reply).
-- Jalankan setelah 004/005. Aman diulang (idempotent guards).
begin;

alter table public.messages add column if not exists image_path text;
alter table public.messages add column if not exists reply_to bigint references public.messages(id) on delete set null;
create index if not exists messages_reply on public.messages(reply_to);

-- Ganti check body lama (wajib 1-2000 char) agar pesan gambar-only (body='') lolos.
do $$
declare r record;
begin
  for r in select conname from pg_constraint where conrelid='public.messages'::regclass and contype='c' and pg_get_constraintdef(oid) like '%trim(body)%'
  loop
    execute format('alter table public.messages drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.messages drop constraint if exists messages_body_or_image_check;
alter table public.messages add constraint messages_body_or_image_check
  check ((char_length(trim(body)) between 1 and 2000) or (body = '' and image_path is not null));

drop function if exists public.send_message(uuid,text,uuid);
create or replace function public.send_message(target uuid,body_value text,request_id uuid,image_value text default null,reply_value bigint default null) returns bigint language plpgsql security definer set search_path='' as $$
declare mid bigint;
begin
 if auth.uid() is null or not exists(select 1 from public.conversations where id=target and auth.uid() in(user_a,user_b)) then raise exception 'Percakapan tidak tersedia'; end if;
 if request_id is null then raise exception 'Request ID tidak valid'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||request_id::text,0));
 select id into mid from public.messages where sender_id=auth.uid() and client_id=request_id; if mid is not null then return mid; end if;
 body_value := coalesce(trim(body_value),'');
 image_value := nullif(trim(coalesce(image_value,'')),'');
 if body_value = '' and image_value is null then raise exception 'Tulis pesan atau pilih gambar.'; end if;
 if char_length(body_value) > 2000 then raise exception 'Pesan maksimal 2000 karakter.'; end if;
 if image_value is not null then
   if char_length(image_value) > 200 or image_value not like 'octgram/chat/'||auth.uid()::text||'\_%' escape '\' then raise exception 'Gambar belum terunggah. Unggah ulang gambarnya.'; end if;
 end if;
 if reply_value is not null and not exists(select 1 from public.messages where id=reply_value and conversation_id=target) then raise exception 'Pesan yang dibalas tidak ditemukan.'; end if;
 perform public.check_rate('message',120,3600);
 insert into public.messages(conversation_id,sender_id,body,client_id,image_path,reply_to) values(target,auth.uid(),body_value,request_id,image_value,reply_value) returning id into mid;
 update public.conversations set updated_at=now() where id=target; return mid;
end $$;

revoke execute on function public.send_message(uuid,text,uuid,text,bigint) from public,anon;
grant execute on function public.send_message(uuid,text,uuid,text,bigint) to authenticated;

commit;
