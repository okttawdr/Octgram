-- Octgram fresh-install schema for a NEW Supabase project.
-- Existing installations must run supabase/upgrades/002_harden_existing.sql instead.
begin;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text not null unique check(username ~ '^[a-z0-9_]{3,24}$'),
 display_name text not null default '' check(char_length(display_name)<=60),
 bio text not null default '' check(char_length(bio)<=160),
 website text not null default '' check(char_length(website)<=2048 and (website='' or website ~ '^https://')),
 avatar_path text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.follows (
 follower_id uuid not null references public.profiles(id) on delete cascade,
 following_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(follower_id,following_id), check(follower_id<>following_id)
);
create index follows_reverse on public.follows(following_id,follower_id);
create table public.posts (
 id bigint generated always as identity primary key,
 user_id uuid not null references public.profiles(id) on delete cascade,
 caption text not null default '' check(char_length(caption)<=2200),
 client_id uuid not null,
 media jsonb not null check(jsonb_typeof(media)='array' and jsonb_array_length(media) between 1 and 20 and octet_length(media::text)<=8192),
 thumbnail_index smallint not null default 0,
 archived boolean not null default false,
 archived_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,client_id)
);
create index posts_author_id on public.posts(user_id,id desc);
create table public.likes (
 post_id bigint not null references public.posts(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(post_id,user_id)
);
create table public.bookmarks (
 post_id bigint not null references public.posts(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(post_id,user_id)
);
create index bookmarks_owner on public.bookmarks(user_id,created_at desc,post_id desc);
create table public.post_collabs (
 post_id bigint not null references public.posts(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(post_id,user_id)
);
create index post_collabs_user on public.post_collabs(user_id,post_id desc);
create table public.reposts (
 post_id bigint not null references public.posts(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(post_id,user_id)
);
create index reposts_owner on public.reposts(user_id,created_at desc);
create table public.comments (
 id bigint generated always as identity primary key,
 post_id bigint not null references public.posts(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 parent_id bigint references public.comments(id) on delete cascade,
 body text not null check(char_length(trim(body)) between 1 and 1000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index comments_post on public.comments(post_id,id desc);
create or replace function public.post_view(pid bigint) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'user_id',p.user_id,'caption',p.caption,'media',p.media,'thumbnail_index',p.thumbnail_index,'created_at',p.created_at,'updated_at',p.updated_at,'archived',p.archived,'collaborators',
  coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'username',c.username,'display_name',c.display_name,'avatar_path',c.avatar_path)) from public.post_collabs pc join public.profiles c on c.id=pc.user_id where pc.post_id=p.id),'[]'::jsonb))
 from public.posts p where p.id=pid;
$$;
create table public.notifications (
 id bigint generated always as identity primary key,
 user_id uuid not null references public.profiles(id) on delete cascade,
 actor_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in ('like','comment','follow','mention','live','repost','collab')),
 post_id bigint references public.posts(id) on delete cascade,
 entity text not null,
 read_at timestamptz,
 created_at timestamptz not null default now(),
 unique(user_id,actor_id,kind,entity)
);
create index notifications_owner on public.notifications(user_id,id desc);
create table public.conversations (
 id uuid primary key default gen_random_uuid(),
 user_a uuid not null references public.profiles(id) on delete cascade,
 user_b uuid not null references public.profiles(id) on delete cascade,
 updated_at timestamptz not null default now(),
 unique(user_a,user_b), check(user_a<user_b)
);
create index conversations_b on public.conversations(user_b,updated_at desc,id desc);
create index conversations_a on public.conversations(user_a,updated_at desc,id desc);
create table public.messages (
 id bigint generated always as identity primary key,
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 sender_id uuid not null references public.profiles(id) on delete cascade,
 body text not null default '',
 client_id uuid not null,
 image_path text,
 media_path text,
 media_type text check(media_type in ('image','video')),
 media_once boolean not null default false,
 media_opened_at timestamptz,
 reply_to bigint references public.messages(id) on delete set null,
 created_at timestamptz not null default now(),
 unique(sender_id,client_id),
 check((char_length(trim(body)) between 1 and 2000) or (body='' and image_path is not null) or (body='' and media_path is not null and media_type is not null and media_once)),
 check((media_path is null and media_type is null and not media_once and media_opened_at is null) or (media_path is not null and media_type is not null and media_once))
);
create index messages_conversation on public.messages(conversation_id,id desc);
create index messages_reply on public.messages(reply_to);
create unique index messages_once_media_path on public.messages(media_path) where media_path is not null;
create table public.rate_buckets (
 user_id uuid not null references public.profiles(id) on delete cascade,
 action text not null,
 window_at timestamptz not null,
 hits integer not null check(hits>0),
 primary key(user_id,action)
);

alter table public.profiles enable row level security;
alter table public.follows enable row level security;
alter table public.posts enable row level security;
alter table public.likes enable row level security;
alter table public.bookmarks enable row level security;
alter table public.comments enable row level security;
alter table public.notifications enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.rate_buckets enable row level security;
alter table public.post_collabs enable row level security;
alter table public.reposts enable row level security;
revoke all on public.profiles,public.follows,public.posts,public.likes,public.bookmarks,public.comments,public.notifications,public.conversations,public.messages,public.rate_buckets,public.post_collabs,public.reposts from anon,authenticated;
grant select on public.profiles,public.follows,public.posts,public.likes,public.bookmarks,public.comments,public.notifications,public.conversations,public.messages,public.post_collabs,public.reposts to authenticated;
grant update(username,display_name,bio,website,avatar_path,updated_at) on public.profiles to authenticated;
grant update(read_at) on public.notifications to authenticated;
create policy profiles_read on public.profiles for select to authenticated using(true);
create policy profiles_update on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()) and (avatar_path is null or avatar_path like id::text||'/%'));
create policy follows_read on public.follows for select to authenticated using(true);
create policy posts_read on public.posts for select to authenticated using(true);
create policy likes_read on public.likes for select to authenticated using(true);
create policy bookmarks_read on public.bookmarks for select to authenticated using(user_id=(select auth.uid()));
create policy comments_read on public.comments for select to authenticated using(true);
create policy notifications_read on public.notifications for select to authenticated using(user_id=(select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy conversations_read on public.conversations for select to authenticated using((select auth.uid()) in (user_a,user_b));
create policy messages_read on public.messages for select to authenticated using(exists(select 1 from public.conversations c where c.id=conversation_id and (select auth.uid()) in (c.user_a,c.user_b)));

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger posts_touch before update on public.posts for each row execute function public.touch_updated_at();
create trigger comments_touch before update on public.comments for each row execute function public.touch_updated_at();
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
declare chosen_name text;
begin
 chosen_name=coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''),nullif(trim(new.raw_user_meta_data->>'name'),''),'Pengguna Octgram');
 insert into public.profiles(id,username,display_name) values(new.id,'u_'||left(replace(new.id::text,'-',''),22),left(chosen_name,60));
 return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.check_rate(a text,cap integer,seconds integer) returns void language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if auth.uid() is null then raise exception 'Silakan masuk dahulu'; end if;
 if cap<1 or seconds<1 then raise exception 'Konfigurasi rate limit tidak valid'; end if;
 insert into public.rate_buckets as b values(auth.uid(),a,now(),1)
 on conflict(user_id,action) do update set hits=case when b.window_at<now()-make_interval(secs=>seconds) then 1 else b.hits+1 end,window_at=case when b.window_at<now()-make_interval(secs=>seconds) then now() else b.window_at end returning hits into n;
 if n>cap then raise exception 'Terlalu sering. Coba lagi sebentar.'; end if;
end $$;
create or replace function public.notify(target uuid,kind_value text,post_value bigint,entity_value text) returns void language sql security definer set search_path='' as $$
 insert into public.notifications(user_id,actor_id,kind,post_id,entity) select target,auth.uid(),kind_value,post_value,entity_value where target is not null and target<>auth.uid() on conflict(user_id,actor_id,kind,entity) do nothing;
$$;
create or replace function public.notify_mentions(body_value text,post_value bigint,entity_value text) returns void language sql security definer set search_path='' as $$
 insert into public.notifications(user_id,actor_id,kind,post_id,entity)
 select p.id,auth.uid(),'mention',post_value,entity_value from public.profiles p where p.username in (select lower(m[2]) from regexp_matches(body_value,'(^|[^a-zA-Z0-9_])@([a-zA-Z0-9_]{3,24})','g') m) and p.id<>auth.uid() on conflict(user_id,actor_id,kind,entity) do nothing;
$$;
create or replace function public.set_follow(target uuid,enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.check_rate('follow',40,3600);
 if target is null or target=auth.uid() then raise exception 'Pilih pengguna lain'; end if;
 if not exists(select 1 from public.profiles where id=target) then raise exception 'Pengguna tidak ditemukan'; end if;
 if enabled then insert into public.follows values(auth.uid(),target,now()) on conflict do nothing; perform public.notify(target,'follow',null,auth.uid()::text);
 else delete from public.follows where follower_id=auth.uid() and following_id=target; end if;
end $$;
create or replace function public.set_like(target bigint,enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.check_rate('like',180,3600);
 if enabled then insert into public.likes values(target,auth.uid(),now()) on conflict do nothing; perform public.notify((select user_id from public.posts where id=target),'like',target,target::text);
 else delete from public.likes where post_id=target and user_id=auth.uid(); end if;
end $$;
create or replace function public.post_collaborators(target bigint) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'username',c.username,'display_name',c.display_name,'avatar_path',c.avatar_path) order by pc.created_at),'[]'::jsonb)
 from public.post_collabs pc join public.profiles c on c.id=pc.user_id where pc.post_id=target;
$$;
create or replace function public.set_bookmark(target bigint,enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.check_rate('bookmark',180,3600);
 if enabled then insert into public.bookmarks values(target,auth.uid(),now()) on conflict do nothing;
 else delete from public.bookmarks where post_id=target and user_id=auth.uid(); end if;
end $$;
create or replace function public.publish_post(caption_value text,media_value jsonb,request_id uuid,thumbnail_value smallint default 0,collab_username text default null) returns bigint language plpgsql security definer set search_path='' as $$
declare item jsonb; pid bigint; followers integer; cap integer; collab_id uuid;
begin
 if auth.uid() is null then raise exception 'Silakan masuk dahulu'; end if;
 if request_id is null then raise exception 'Request ID tidak valid'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||request_id::text,0));
 select id into pid from public.posts where user_id=auth.uid() and client_id=request_id; if pid is not null then return pid; end if;
 perform public.check_rate('post',10,86400);
 if collab_username is not null and btrim(collab_username)<>'' then
  select id into collab_id from public.profiles where username=lower(btrim(collab_username));
  if collab_id is null or collab_id=auth.uid() then raise exception 'Kolaborator tidak ditemukan'; end if;
 else collab_id:=null; end if;
 select count(*) into followers from public.follows where following_id=auth.uid();
 -- Kuota jumlah postingan per akun (tidak ditampilkan di UI pengguna).
 if (select count(*) from public.posts where user_id=auth.uid() and not archived) >= (case when followers>10 then 30 else 24 end) then
  raise exception 'Ruang ceritamu sudah penuh. Bersihkan beberapa postingan untuk berbagi lagi.';
 end if;
 cap := case when followers>=100 then 20 else 8 end;
 if jsonb_typeof(media_value)<>'array' or jsonb_array_length(media_value) not between 1 and cap then raise exception 'Pilih 1â€“% foto',cap; end if;
 if thumbnail_value not between 0 and jsonb_array_length(media_value)-1 then raise exception 'Thumbnail tidak valid'; end if;
 for item in select value from jsonb_array_elements(media_value) loop
  if jsonb_typeof(item) is distinct from 'object' or not (item ?& array['path','width','height','bytes'])
   or jsonb_typeof(item->'path') is distinct from 'string' or jsonb_typeof(item->'width') is distinct from 'number' or jsonb_typeof(item->'height') is distinct from 'number' or jsonb_typeof(item->'bytes') is distinct from 'number'
   or (item->>'width')::integer not between 1 and 16000 or (item->>'height')::integer not between 1 and 16000 or (item->>'bytes')::integer not between 1 and 1150000
   or item->>'path' not like 'octgram/posts/'||auth.uid()::text||'\_%' escape '\'
  then raise exception 'Media tidak valid, belum terunggah, atau melebihi 1 MB'; end if;
 end loop;
 insert into public.posts(user_id,caption,media,thumbnail_index,client_id) values(auth.uid(),coalesce(caption_value,''),media_value,thumbnail_value,request_id) returning id into pid;
 if collab_id is not null then
  insert into public.post_collabs(post_id,user_id) values(pid,collab_id);
  perform public.notify(collab_id,'collab',pid,'collab:'||pid);
 end if;
 perform public.notify_mentions(coalesce(caption_value,''),pid,'p:'||pid); return pid;
end $$;
create or replace function public.add_comment(target bigint,body_value text,parent_value bigint default null) returns bigint language plpgsql security definer set search_path='' as $$
declare cid bigint; parent_owner uuid;
begin
 perform public.check_rate('comment',60,3600);
 if not exists(select 1 from public.posts where id=target) then raise exception 'Postingan tidak ditemukan'; end if;
 if parent_value is not null then select user_id into parent_owner from public.comments where id=parent_value and post_id=target; if not found then raise exception 'Komentar induk tidak ditemukan'; end if; end if;
 insert into public.comments(post_id,user_id,parent_id,body) values(target,auth.uid(),parent_value,trim(body_value)) returning id into cid;
 perform public.notify((select user_id from public.posts where id=target),'comment',target,'c:'||cid); perform public.notify(parent_owner,'comment',target,'c:'||cid); perform public.notify_mentions(body_value,target,'c:'||cid); return cid;
end $$;
create or replace function public.start_chat(target uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 perform public.check_rate('chat',30,3600);
 if target is null or target=auth.uid() then raise exception 'Pilih pengguna lain'; end if;
 if not exists(select 1 from public.profiles where id=target) then raise exception 'Pengguna tidak ditemukan'; end if;
 insert into public.conversations(user_a,user_b) values(least(auth.uid(),target),greatest(auth.uid(),target)) on conflict(user_a,user_b) do update set user_a=excluded.user_a returning id into cid; return cid;
end $$;
drop function if exists public.send_message(uuid,text,uuid);
create or replace function public.send_message(target uuid,body_value text,request_id uuid,media_value text default null,media_type_value text default null,media_once_value boolean default false,reply_value bigint default null) returns bigint language plpgsql security definer set search_path='' as $$
declare mid bigint;
begin
 if auth.uid() is null or not exists(select 1 from public.conversations where id=target and auth.uid() in(user_a,user_b)) then raise exception 'Percakapan tidak tersedia'; end if;
 if request_id is null then raise exception 'Request ID tidak valid'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||request_id::text,0));
 select id into mid from public.messages where sender_id=auth.uid() and client_id=request_id; if mid is not null then return mid; end if;
 body_value := coalesce(trim(body_value),'');
 media_value := nullif(trim(coalesce(media_value,'')),'');
 media_type_value := nullif(trim(coalesce(media_type_value,'')),'');
 if body_value = '' and media_value is null then raise exception 'Tulis pesan atau pilih media sekali lihat.'; end if;
 if char_length(body_value) > 2000 then raise exception 'Pesan maksimal 2000 karakter.'; end if;
 if media_value is not null then
   if not media_once_value or media_type_value not in ('image','video') or media_value not like auth.uid()::text||'/'||target::text||'/%' then raise exception 'Media sekali lihat tidak valid.'; end if;
   if not exists(select 1 from storage.objects where bucket_id='chat-once' and name=media_value and owner_id=auth.uid()::text) then raise exception 'Media belum terunggah ke Supabase.'; end if;
 elsif media_type_value is not null or media_once_value then raise exception 'Data media tidak lengkap.';
 end if;
 if reply_value is not null and not exists(select 1 from public.messages where id=reply_value and conversation_id=target) then raise exception 'Pesan yang dibalas tidak ditemukan.'; end if;
 perform public.check_rate('message',120,3600);
 insert into public.messages(conversation_id,sender_id,body,client_id,media_path,media_type,media_once,reply_to) values(target,auth.uid(),body_value,request_id,media_value,media_type_value,media_once_value,reply_value) returning id into mid;
 update public.conversations set updated_at=now() where id=target; return mid;
end $$;
create or replace function public.open_once_media(target bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare row public.messages;
begin
 select m.* into row from public.messages m join public.conversations c on c.id=m.conversation_id where m.id=target and m.media_once and m.media_path is not null and auth.uid() in(c.user_a,c.user_b) and m.sender_id<>auth.uid() for update of m;
 if row.id is null then raise exception 'Media tidak tersedia atau sudah dihapus.'; end if;
 update public.messages set media_opened_at=coalesce(media_opened_at,now()) where id=target;
 return jsonb_build_object('path',row.media_path,'type',row.media_type);
end $$;
create or replace function public.finish_once_media(target bigint) returns void language plpgsql security definer set search_path='' as $$
declare row public.messages;
begin
 select m.* into row from public.messages m join public.conversations c on c.id=m.conversation_id where m.id=target and m.media_once and m.media_path is not null and m.media_opened_at is not null and auth.uid() in(c.user_a,c.user_b) and m.sender_id<>auth.uid() for update of m;
 if row.id is null then raise exception 'Media tidak tersedia atau belum dibuka.'; end if;
 delete from public.messages where id=target;
 delete from storage.objects where bucket_id='chat-once' and name=row.media_path;
end $$;
create or replace function public.feed(before_id bigint default null,author_id uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'user_id',p.user_id,'caption',p.caption,'media',p.media,'thumbnail_index',p.thumbnail_index,'created_at',p.created_at,'updated_at',p.updated_at,'archived',p.archived,'author',jsonb_build_object('id',pr.id,'username',pr.username,'display_name',pr.display_name,'avatar_path',pr.avatar_path),'collaborators',coalesce((select jsonb_agg(jsonb_build_object('id',cp.id,'username',cp.username,'display_name',cp.display_name,'avatar_path',cp.avatar_path)) from public.post_collabs pc join public.profiles cp on cp.id=pc.user_id where pc.post_id=p.id),'[]'::jsonb),'like_count',(select count(*) from public.likes l where l.post_id=p.id),'comment_count',(select count(*) from public.comments c where c.post_id=p.id),'repost_count',(select count(*) from public.reposts r where r.post_id=p.id),'liked',exists(select 1 from public.likes l where l.post_id=p.id and l.user_id=auth.uid()),'bookmarked',exists(select 1 from public.bookmarks b where b.post_id=p.id and b.user_id=auth.uid()),'reposted',exists(select 1 from public.reposts r where r.post_id=p.id and r.user_id=auth.uid())) order by p.id desc),'[]'::jsonb)
 from (select * from public.posts p where not p.archived and (before_id is null or p.id<before_id) and ((author_id is not null and p.user_id=author_id) or (author_id is null and (p.user_id=auth.uid() or exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.following_id=p.user_id)))) order by p.id desc limit 10) p join public.profiles pr on pr.id=p.user_id;
$$;
create or replace function public.explore_feed(before_id bigint default null) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'user_id',p.user_id,'caption',p.caption,'media',p.media,'thumbnail_index',p.thumbnail_index,'created_at',p.created_at,'updated_at',p.updated_at,'archived',p.archived,'author',jsonb_build_object('id',pr.id,'username',pr.username,'display_name',pr.display_name,'avatar_path',pr.avatar_path),'collaborators',coalesce((select jsonb_agg(jsonb_build_object('id',cp.id,'username',cp.username,'display_name',cp.display_name,'avatar_path',cp.avatar_path)) from public.post_collabs pc join public.profiles cp on cp.id=pc.user_id where pc.post_id=p.id),'[]'::jsonb),'like_count',(select count(*) from public.likes l where l.post_id=p.id),'comment_count',(select count(*) from public.comments c where c.post_id=p.id),'repost_count',(select count(*) from public.reposts r where r.post_id=p.id),'liked',exists(select 1 from public.likes l where l.post_id=p.id and l.user_id=auth.uid()),'bookmarked',exists(select 1 from public.bookmarks b where b.post_id=p.id and b.user_id=auth.uid()),'reposted',exists(select 1 from public.reposts r where r.post_id=p.id and r.user_id=auth.uid())) order by p.id desc),'[]'::jsonb)
 from (select * from public.posts p where not p.archived and (before_id is null or p.id<before_id) order by p.id desc limit 10) p join public.profiles pr on pr.id=p.user_id;
$$;
create or replace function public.saved_feed(before_id bigint default null) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'user_id',p.user_id,'caption',p.caption,'media',p.media,'thumbnail_index',p.thumbnail_index,'created_at',p.created_at,'updated_at',p.updated_at,'archived',p.archived,'author',jsonb_build_object('id',pr.id,'username',pr.username,'display_name',pr.display_name,'avatar_path',pr.avatar_path),'collaborators',coalesce((select jsonb_agg(jsonb_build_object('id',cp.id,'username',cp.username,'display_name',cp.display_name,'avatar_path',cp.avatar_path)) from public.post_collabs pc join public.profiles cp on cp.id=pc.user_id where pc.post_id=p.id),'[]'::jsonb),'like_count',(select count(*) from public.likes l where l.post_id=p.id),'comment_count',(select count(*) from public.comments c where c.post_id=p.id),'repost_count',(select count(*) from public.reposts r where r.post_id=p.id),'liked',exists(select 1 from public.likes l where l.post_id=p.id and l.user_id=auth.uid()),'bookmarked',true,'reposted',exists(select 1 from public.reposts r where r.post_id=p.id and r.user_id=auth.uid())) order by p.id desc),'[]'::jsonb)
 from (select * from public.bookmarks where user_id=auth.uid() and (before_id is null or post_id<before_id) order by post_id desc limit 10) b join public.posts p on p.id=b.post_id and not p.archived join public.profiles pr on pr.id=p.user_id;
$$;

revoke execute on function public.touch_updated_at(),public.handle_new_user(),public.check_rate(text,integer,integer),public.notify(uuid,text,bigint,text),public.notify_mentions(text,bigint,text) from public,anon,authenticated;
create or replace function public.edit_post(target bigint,caption_value text,thumbnail_value smallint default null) returns void language plpgsql security definer set search_path='' as $$
declare row public.posts;
begin
 if auth.uid() is null then raise exception 'Silakan masuk dahulu'; end if;
 select * into row from public.posts where id=target and user_id=auth.uid();
 if row.id is null then raise exception 'Postingan tidak ditemukan'; end if;
 if caption_value is not null then update public.posts set caption=coalesce(caption_value,'') where id=target; end if;
 if thumbnail_value is not null then
  if thumbnail_value not between 0 and coalesce(jsonb_array_length(row.media)-1,0) then raise exception 'Thumbnail tidak valid'; end if;
  update public.posts set thumbnail_index=thumbnail_value where id=target;
 end if;
 update public.posts set updated_at=now() where id=target;
end $$;

create or replace function public.archive_post(target bigint,archived_value boolean default true) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Silakan masuk dahulu'; end if;
 update public.posts set archived=archived_value where id=target and user_id=auth.uid();
 if not found then raise exception 'Postingan tidak ditemukan'; end if;
end $$;

create or replace function public.delete_post(target bigint) returns void language plpgsql security definer set search_path='' as $$
declare media jsonb; paths text[];
begin
 if auth.uid() is null then raise exception 'Silakan masuk dahulu'; end if;
 delete from public.posts where id=target and user_id=auth.uid() returning media into media;
 if not found then raise exception 'Postingan tidak ditemukan'; end if;
 paths := coalesce((select array_agg(m->>'path') from jsonb_array_elements(media) m), array[]::text[]);
 if coalesce(array_length(paths,1),0) > 0 then
  delete from storage.objects where bucket_id='photos' and owner_id=auth.uid()::text and name=any(paths);
 end if;
end $$;

create or replace function public.set_repost(target bigint,enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.check_rate('repost',60,3600);
 if enabled then
  if not exists(select 1 from public.posts p where p.id=target and not p.archived) then raise exception 'Postingan tidak ditemukan'; end if;
  if exists(select 1 from public.reposts r where r.post_id=target and r.user_id=auth.uid()) then return; end if;
  insert into public.reposts(post_id,user_id) values(target,auth.uid());
  perform public.notify((select p.user_id from public.posts p where p.id=target),'repost',target,target::text);
 else
  delete from public.reposts where post_id=target and user_id=auth.uid();
 end if;
end $$;
create or replace function public.post_likes(target bigint,before_time timestamptz default null) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('user',jsonb_build_object('id',pr.id,'username',pr.username,'display_name',pr.display_name,'avatar_path',pr.avatar_path),'created_at',l.created_at) order by l.created_at desc),'[]'::jsonb)
 from (select * from public.likes where post_id=target and (before_time is null or created_at<before_time) order by created_at desc limit 30) l
 join public.profiles pr on pr.id=l.user_id;
$$;
create or replace function public.post_reposters(target bigint) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('user',jsonb_build_object('id',pr.id,'username',pr.username,'display_name',pr.display_name,'avatar_path',pr.avatar_path),'created_at',r.created_at) order by r.created_at desc),'[]'::jsonb)
 from (select * from public.reposts where post_id=target order by created_at desc limit 8) r join public.profiles pr on pr.id=r.user_id;
$$;

create or replace function public.follow_list(target uuid,kind_value text,before_time timestamptz default null) returns jsonb language sql stable security invoker set search_path='' as $$  select coalesce(jsonb_agg(jsonb_build_object('user',jsonb_build_object('id',pr.id,'username',pr.username,'display_name',pr.display_name,'avatar_path',pr.avatar_path),'created_at',f.created_at) order by f.created_at desc),'[]'::jsonb)
  from (
    select * from (
     select f2.follower_id as user_id,f2.created_at from public.follows f2 where f2.following_id=target and kind_value='followers' and (before_time is null or f2.created_at<before_time)
     union all
     select f3.following_id as user_id,f3.created_at from public.follows f3 where f3.follower_id=target and kind_value='following' and (before_time is null or f3.created_at<before_time)
    ) combined order by created_at desc limit 30
  ) f join public.profiles pr on pr.id=f.user_id;$$;
create or replace function public.is_octgram_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u left join public.profiles p on p.id=u.id where u.id=auth.uid() and (lower(coalesce(u.email,'')) in ('okttawdr@gmail.com','shusensei27@gmail.com') or lower(coalesce(p.username,'')) in ('okta_bringass','octaxyzz_')));
$$;
create or replace function public.db_stats() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.is_octgram_admin() then
  return '{"allowed":false}'::jsonb;
 end if;
 select jsonb_build_object(
  'allowed',true,
  'profiles',(select count(*) from public.profiles),
  'posts',(select count(*) from public.posts),
  'archived_posts',(select count(*) from public.posts where archived),
  'likes',(select count(*) from public.likes),
  'comments',(select count(*) from public.comments),
  'follows',(select count(*) from public.follows),
  'bookmarks',(select count(*) from public.bookmarks),
  'reposts',(select count(*) from public.reposts),
  'collabs',(select count(*) from public.post_collabs),
  'messages',(select count(*) from public.messages),
  'conversations',(select count(*) from public.conversations),
  'notifications',(select count(*) from public.notifications),
  'live_streams',(select count(*) from public.live_streams),
  'storage_objects',(select count(*) from storage.objects where bucket_id='photos'),
  'new_users_7d',(select count(*) from public.profiles where created_at>now()-interval '7 days'),
  'new_posts_24h',(select count(*) from public.posts where created_at>now()-interval '24 hours')
 ) into result;
 return result;
end $$;

revoke execute on function public.set_follow(uuid,boolean),public.set_like(bigint,boolean),public.set_bookmark(bigint,boolean),public.publish_post(text,jsonb,uuid,smallint,text),public.edit_post(bigint,text,smallint),public.archive_post(bigint,boolean),public.delete_post(bigint),public.set_repost(bigint,boolean),public.add_comment(bigint,text,bigint),public.start_chat(uuid),public.send_message(uuid,text,uuid,text,text,boolean,bigint),public.open_once_media(bigint),public.finish_once_media(bigint),public.feed(bigint,uuid),public.explore_feed(bigint),public.saved_feed(bigint),public.post_view(bigint),public.post_collaborators(bigint),public.post_likes(bigint,timestamptz),public.post_reposters(bigint),public.follow_list(uuid,text,timestamptz),public.db_stats(),public.is_octgram_admin() from public,anon;
grant execute on function public.set_follow(uuid,boolean),public.set_like(bigint,boolean),public.set_bookmark(bigint,boolean),public.publish_post(text,jsonb,uuid,smallint,text),public.edit_post(bigint,text,smallint),public.archive_post(bigint,boolean),public.delete_post(bigint),public.set_repost(bigint,boolean),public.add_comment(bigint,text,bigint),public.start_chat(uuid),public.send_message(uuid,text,uuid,text,text,boolean,bigint),public.open_once_media(bigint),public.finish_once_media(bigint),public.feed(bigint,uuid),public.explore_feed(bigint),public.saved_feed(bigint),public.post_view(bigint),public.post_collaborators(bigint),public.post_likes(bigint,timestamptz),public.post_reposters(bigint),public.follow_list(uuid,text,timestamptz),public.db_stats(),public.is_octgram_admin() to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('photos','photos',true,5242880,array['image/webp']) on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create or replace function public.storage_capacity() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (select count(*) from storage.objects where bucket_id='photos' and owner_id=auth.uid()::text)<250;
$$;
revoke execute on function public.storage_capacity() from public,anon;
grant execute on function public.storage_capacity() to authenticated;
create policy octgram_upload on storage.objects for insert to authenticated with check(bucket_id='photos' and (storage.foldername(name))[1]=(select auth.uid())::text and lower(storage.extension(name))='webp' and owner_id=(select auth.uid())::text and (select public.storage_capacity()));
create policy octgram_own_objects on storage.objects for select to authenticated using(bucket_id='photos' and owner_id=(select auth.uid())::text);
create policy octgram_remove_unused on storage.objects for delete to authenticated using(bucket_id='photos' and owner_id=(select auth.uid())::text and not exists(select 1 from public.posts p,jsonb_array_elements(p.media) m where m->>'path'=name) and not exists(select 1 from public.profiles p where p.avatar_path=name));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('chat-once','chat-once',false,26214400,array['image/webp','video/mp4','video/webm']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy chat_once_upload on storage.objects for insert to authenticated with check(bucket_id='chat-once' and owner_id=(select auth.uid())::text and (storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.conversations c where c.id=((storage.foldername(name))[2])::uuid and (select auth.uid()) in(c.user_a,c.user_b)) and lower(storage.extension(name)) in ('webp','mp4','webm'));
create policy chat_once_read_receiver on storage.objects for select to authenticated using(bucket_id='chat-once' and exists(select 1 from public.messages m join public.conversations c on c.id=m.conversation_id where m.media_path=name and (select auth.uid()) in(c.user_a,c.user_b) and m.sender_id<>(select auth.uid())));
create policy chat_once_remove_unsent on storage.objects for delete to authenticated using(bucket_id='chat-once' and owner_id=(select auth.uid())::text and not exists(select 1 from public.messages m where m.media_path=name));
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notifications;

-- Livestreaming (see LIVESTREAM.md for the LiveKit setup this depends on).
create table public.live_streams (
  id bigserial primary key,
  host_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '' check(char_length(title)<=100),
  room_name text not null unique,
  status text not null default 'live' check(status in ('live','ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index live_streams_status on public.live_streams(status, started_at desc);
create unique index live_streams_one_active_host on public.live_streams(host_id) where status='live';
alter table public.live_streams enable row level security;
revoke all on public.live_streams from anon,authenticated;
grant select on public.live_streams to authenticated;
create policy live_streams_read on public.live_streams for select to authenticated
  using (status='live' or host_id=(select auth.uid()));

create or replace function public.start_live(title_value text)
returns public.live_streams language plpgsql security definer set search_path='' as $$
declare row public.live_streams;
begin
  perform public.check_rate('live_start', 3, 3600);
  if (select count(*) from public.follows where following_id=auth.uid()) < 100
    and lower(coalesce(auth.jwt()->>'email',current_setting('request.jwt.claim.email',true),'')) not in ('okttawdr@gmail.com','shusensei27@gmail.com') then
    raise exception 'Butuh minimal 100 pengikut untuk mulai live.' using errcode='42501';
  end if;
  update public.live_streams set status='ended', ended_at=now() where host_id=auth.uid() and status='live';
  insert into public.live_streams(host_id, title, room_name)
    values (auth.uid(), coalesce(nullif(trim(title_value),''),'Live'), 'oct_'||replace(gen_random_uuid()::text,'-',''))
    returning * into row;
  insert into public.notifications(user_id, actor_id, kind, post_id, entity)
    select f.follower_id, auth.uid(), 'live', null, row.id::text
    from public.follows f where f.following_id=auth.uid();
  return row;
end $$;

create or replace function public.end_live()
returns void language sql security definer set search_path='' as $$
  update public.live_streams set status='ended', ended_at=now() where host_id=auth.uid() and status='live';
$$;

create or replace function public.live_feed()
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'title', s.title, 'room_name', s.room_name, 'started_at', s.started_at,
    'host', jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_path', p.avatar_path)
  ) order by s.started_at desc), '[]'::jsonb)
  from public.live_streams s join public.profiles p on p.id=s.host_id
  where s.status='live';
$$;

create or replace function public.live_stream(target bigint)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'id', s.id, 'title', s.title, 'room_name', s.room_name, 'status', s.status, 'started_at', s.started_at,
    'host', jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_path', p.avatar_path)
  )
  from public.live_streams s join public.profiles p on p.id=s.host_id
  where s.id=target and (s.status='live' or s.host_id=(select auth.uid()));
$$;

revoke execute on function public.start_live(text), public.end_live(), public.live_feed(), public.live_stream(bigint) from public,anon;
grant execute on function public.start_live(text), public.end_live(), public.live_feed(), public.live_stream(bigint) to authenticated;
alter publication supabase_realtime add table public.live_streams;
commit;

-- Final provider/quota layer. Kept in the fresh schema so a new project only
-- needs this one file. Existing projects run upgrades/005_agora_streaming.sql.
begin;
alter table public.live_streams add column if not exists provider text not null default 'agora' check(provider in ('agora','livekit'));
alter table public.live_streams add column if not exists session_minutes integer not null default 60 check(session_minutes between 1 and 90);
create table if not exists public.stream_usage (
 provider text not null check(provider in ('agora','livekit')), month text not null,
 minutes_used numeric not null default 0 check(minutes_used>=0), primary key(provider,month)
);
create table if not exists public.stream_reservations (
 stream_id bigint not null references public.live_streams(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 provider text not null check(provider in ('agora','livekit')), month text not null,
 reserved_minutes integer not null check(reserved_minutes between 1 and 90),
 created_at timestamptz not null default now(), primary key(stream_id,user_id)
);
alter table public.stream_usage enable row level security;
alter table public.stream_reservations enable row level security;
revoke all on public.stream_usage,public.stream_reservations from anon,authenticated;
drop function if exists public.start_live(text);
drop function if exists public.end_live();
drop function if exists public.record_stream_usage(text,numeric);

create or replace function public.start_live(title_value text,agora_available boolean,livekit_available boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare stream_row public.live_streams; month_key text:=to_char(now(),'YYYY-MM'); agora_used numeric:=0; livekit_used numeric:=0; chosen text; minutes_left numeric; allocation integer;
begin
 if auth.uid() is null then raise exception 'Silakan masuk dahulu.' using errcode='42501'; end if;
 if (select count(*) from public.follows where following_id=auth.uid())<100 and not public.is_octgram_admin() then raise exception 'Butuh minimal 100 pengikut untuk mulai live.' using errcode='42501'; end if;
 perform public.check_rate('live_start',3,3600);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('octgram-quota:'||month_key,0));
 select coalesce((select su.minutes_used from public.stream_usage su where su.provider='agora' and su.month=month_key),0) into agora_used;
 select coalesce((select su.minutes_used from public.stream_usage su where su.provider='livekit' and su.month=month_key),0) into livekit_used;
 if agora_available and agora_used<=8899 then chosen:='agora'; minutes_left:=8900-agora_used;
 elsif livekit_available and livekit_used<=3999 then chosen:='livekit'; minutes_left:=4000-livekit_used;
 else raise exception 'Live sedang tidak tersedia saat ini. Coba lagi nanti.'; end if;
 allocation:=least(90,greatest(1,floor(minutes_left)::integer));
 update public.live_streams set status='ended',ended_at=now() where host_id=auth.uid() and status='live';
 insert into public.live_streams(host_id,title,room_name,provider,session_minutes) values(auth.uid(),coalesce(nullif(trim(title_value),''),'Live'),'oct_'||replace(gen_random_uuid()::text,'-',''),chosen,allocation) returning * into stream_row;
 insert into public.stream_reservations(stream_id,user_id,provider,month,reserved_minutes) values(stream_row.id,auth.uid(),chosen,month_key,allocation);
 insert into public.stream_usage(provider,month,minutes_used) values(chosen,month_key,allocation) on conflict(provider,month) do update set minutes_used=public.stream_usage.minutes_used+excluded.minutes_used;
 insert into public.notifications(user_id,actor_id,kind,post_id,entity) select f.follower_id,auth.uid(),'live',null,stream_row.id::text from public.follows f where f.following_id=auth.uid();
 return jsonb_build_object('id',stream_row.id,'title',stream_row.title,'room_name',stream_row.room_name,'provider',chosen,'session_minutes',allocation,'reservation_minutes',allocation,'status','live','started_at',stream_row.started_at,'host',jsonb_build_object('id',auth.uid()));
end $$;

create or replace function public.live_feed() returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'room_name',s.room_name,'provider',s.provider,'started_at',s.started_at,'host',jsonb_build_object('id',p.id,'username',p.username,'display_name',p.display_name,'avatar_path',p.avatar_path)) order by s.started_at desc),'[]'::jsonb) from public.live_streams s join public.profiles p on p.id=s.host_id where s.status='live';
$$;
create or replace function public.live_stream(target bigint) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',s.id,'title',s.title,'room_name',s.room_name,'provider',s.provider,'session_minutes',s.session_minutes,'status',s.status,'started_at',s.started_at,'host',jsonb_build_object('id',p.id,'username',p.username,'display_name',p.display_name,'avatar_path',p.avatar_path)) from public.live_streams s join public.profiles p on p.id=s.host_id where s.id=target and (s.status='live' or s.host_id=(select auth.uid()));
$$;
create or replace function public.join_live(target bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare stream_row public.live_streams; month_key text:=to_char(now(),'YYYY-MM'); remaining integer; already_reserved integer; used numeric; safe_cap numeric; result jsonb;
begin
 if auth.uid() is null then raise exception 'Silakan masuk dahulu.' using errcode='42501'; end if;
 select * into stream_row from public.live_streams where id=target;
 if stream_row.id is null then return null; end if;
 if stream_row.status<>'live' or now()>=stream_row.started_at+make_interval(mins=>stream_row.session_minutes) then update public.live_streams set status='ended',ended_at=coalesce(ended_at,now()) where id=target and status='live'; raise exception 'Live sedang tidak tersedia saat ini. Coba lagi nanti.'; end if;
 select sr.reserved_minutes into already_reserved from public.stream_reservations sr where sr.stream_id=target and sr.user_id=auth.uid();
 if already_reserved is null then
  remaining:=greatest(1,ceil(stream_row.session_minutes-extract(epoch from (now()-stream_row.started_at))/60.0)::integer);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('octgram-quota:'||month_key,0));
  select sr.reserved_minutes into already_reserved from public.stream_reservations sr where sr.stream_id=target and sr.user_id=auth.uid();
  if already_reserved is not null then result:=public.live_stream(target); return result||jsonb_build_object('reservation_minutes',already_reserved); end if;
  select coalesce((select su.minutes_used from public.stream_usage su where su.provider=stream_row.provider and su.month=month_key),0) into used;
  safe_cap:=case stream_row.provider when 'agora' then 8900 else 4000 end;
  if used+remaining>safe_cap then raise exception 'Live sedang tidak tersedia saat ini. Coba lagi nanti.'; end if;
  insert into public.stream_reservations(stream_id,user_id,provider,month,reserved_minutes) values(target,auth.uid(),stream_row.provider,month_key,remaining);
  insert into public.stream_usage(provider,month,minutes_used) values(stream_row.provider,month_key,remaining) on conflict(provider,month) do update set minutes_used=public.stream_usage.minutes_used+excluded.minutes_used;
  already_reserved:=remaining;
 end if;
 result:=public.live_stream(target); return result||jsonb_build_object('reservation_minutes',already_reserved);
end $$;
create or replace function public.end_live(target bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare stream_row public.live_streams;
begin update public.live_streams set status='ended',ended_at=now() where id=target and host_id=auth.uid() and status='live' returning * into stream_row; if stream_row.id is null then return null; end if; return jsonb_build_object('id',stream_row.id,'provider',stream_row.provider,'room_name',stream_row.room_name); end $$;
create or replace function public.reconcile_stream(room_value text) returns void language sql security definer set search_path='' as $$ update public.live_streams set status='ended',ended_at=now() where room_name=room_value and status='live'; $$;
revoke execute on function public.start_live(text,boolean,boolean),public.join_live(bigint),public.end_live(bigint),public.live_feed(),public.live_stream(bigint) from public,anon,authenticated;
revoke execute on function public.reconcile_stream(text) from public, anon, authenticated;
grant execute on function public.start_live(text,boolean,boolean),public.join_live(bigint),public.end_live(bigint),public.live_feed(),public.live_stream(bigint) to authenticated;
grant execute on function public.reconcile_stream(text) to service_role;
commit;
-- Upgrade 008: feed khusus untuk postingan yang diarsipkan sendiri.
-- Jalankan di Supabase SQL Editor untuk database yang SUDAH berisi data.
begin;

create or replace function public.archived_feed(before_id bigint default null) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'user_id',p.user_id,'caption',p.caption,'media',p.media,'thumbnail_index',p.thumbnail_index,'created_at',p.created_at,'updated_at',p.updated_at,'archived',p.archived,'author',jsonb_build_object('id',pr.id,'username',pr.username,'display_name',pr.display_name,'avatar_path',pr.avatar_path),'collaborators',coalesce((select jsonb_agg(jsonb_build_object('id',cp.id,'username',cp.username,'display_name',cp.display_name,'avatar_path',cp.avatar_path)) from public.post_collabs pc join public.profiles cp on cp.id=pc.user_id where pc.post_id=p.id),'[]'::jsonb),'like_count',(select count(*) from public.likes l where l.post_id=p.id),'comment_count',(select count(*) from public.comments c where c.post_id=p.id),'repost_count',(select count(*) from public.reposts r where r.post_id=p.id),'liked',exists(select 1 from public.likes l where l.post_id=p.id and l.user_id=auth.uid()),'bookmarked',exists(select 1 from public.bookmarks b where b.post_id=p.id and b.user_id=auth.uid()),'reposted',exists(select 1 from public.reposts r where r.post_id=p.id and r.user_id=auth.uid())) order by p.id desc),'[]'::jsonb)
 from (select * from public.posts p where p.user_id=auth.uid() and p.archived and (before_id is null or p.id<before_id) order by p.id desc limit 10) p join public.profiles pr on pr.id=p.user_id;
$$;
revoke execute on function public.archived_feed(bigint) from public,anon;
grant execute on function public.archived_feed(bigint) to authenticated;

commit;
