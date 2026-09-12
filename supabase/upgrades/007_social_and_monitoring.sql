-- Upgrade 007: arsip/kolaborasi/repost, edit postingan, daftar likes,
-- daftar followers/following, monitoring database (db_stats) dan bypass
-- live untuk dua email tepercaya.
-- Jalankan di Supabase SQL Editor untuk database yang SUDAH berisi data.
begin;

alter table public.posts add column if not exists archived boolean not null default false;
alter table public.posts add column if not exists archived_at timestamptz;

create table if not exists public.post_collabs (
 post_id bigint not null references public.posts(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(post_id,user_id)
);
create index if not exists post_collabs_user on public.post_collabs(user_id,post_id desc);
create table if not exists public.reposts (
 post_id bigint not null references public.posts(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(post_id,user_id)
);
create index if not exists reposts_owner on public.reposts(user_id,created_at desc);

alter table public.post_collabs enable row level security;
alter table public.reposts enable row level security;
revoke all on public.post_collabs,public.reposts from anon,authenticated;
grant select on public.post_collabs,public.reposts to authenticated;

-- Izinkan kind notifikasi baru (repost, collab).
do $$
declare c text;
begin
 for c in select conname from pg_constraint
  where conrelid='public.notifications'::regclass and contype='c'
   and pg_get_constraintdef(oid) like '%kind%'
   and pg_get_constraintdef(oid) not like '%repost%'
 loop
  execute 'alter table public.notifications drop constraint '||c;
 end loop;
end $$;
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind
 check(kind in ('like','comment','follow','mention','live','repost','collab'));
create or replace function public.post_view(pid bigint) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'user_id',p.user_id,'caption',p.caption,'media',p.media,'thumbnail_index',p.thumbnail_index,'created_at',p.created_at,'updated_at',p.updated_at,'archived',p.archived,'collaborators',
  coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'username',c.username,'display_name',c.display_name,'avatar_path',c.avatar_path)) from public.post_collabs pc join public.profiles c on c.id=pc.user_id where pc.post_id=p.id),'[]'::jsonb))
 from public.posts p where p.id=pid;
$$;

create or replace function public.post_collaborators(target bigint) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'username',c.username,'display_name',c.display_name,'avatar_path',c.avatar_path) order by pc.created_at),'[]'::jsonb)
 from public.post_collabs pc join public.profiles c on c.id=pc.user_id where pc.post_id=target;
$$;

-- publish_post: kolaborator + kuota postingan per akun (24/30, tidak ditampilkan di UI).
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
 if (select count(*) from public.posts where user_id=auth.uid() and not archived) >= (case when followers>10 then 30 else 24 end) then
  raise exception 'Ruang ceritamu sudah penuh. Bersihkan beberapa postingan untuk berbagi lagi.';
 end if;
 cap := case when followers>=100 then 20 else 8 end;
 if jsonb_typeof(media_value)<>'array' or jsonb_array_length(media_value) not between 1 and cap then raise exception 'Pilih 1-% foto',cap; end if;
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

create or replace function public.follow_list(target uuid,kind_value text,before_time timestamptz default null) returns jsonb language sql stable security invoker set search_path='' as $$  select coalesce(jsonb_agg(jsonb_build_object('user',jsonb_build_object('id',pr.id,'username',pr.username,'display_name',pr.display_name,'avatar_path',pr.avatar_path),'created_at',f.created_at) order by f.created_at desc),'[]'::jsonb)
  from (
    select * from (
     select f2.follower_id as user_id,f2.created_at from public.follows f2 where f2.following_id=target and kind_value='followers' and (before_time is null or f2.created_at<before_time)
     union all
     select f3.following_id as user_id,f3.created_at from public.follows f3 where f3.follower_id=target and kind_value='following' and (before_time is null or f3.created_at<before_time)
    ) combined order by created_at desc limit 30
  ) f join public.profiles pr on pr.id=f.user_id;$$;

create or replace function public.db_stats() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then return '{"allowed":false}'::jsonb; end if;
 if lower(coalesce(current_setting('request.jwt.claim.email',true),'')) not in ('okttawdr@gmail.com','shusensei27@gmail.com') then
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

-- start_live dengan bypass untuk dua email tepercaya (tidak butuh 100 pengikut).
drop function if exists public.start_live(text);
create or replace function public.start_live(title_value text, agora_available boolean, livekit_available boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  stream_row public.live_streams;
  month_key text := to_char(now(),'YYYY-MM');
  agora_used numeric := 0;
  livekit_used numeric := 0;
  agora_safe constant numeric := 8900;
  livekit_safe constant numeric := 4000;
  chosen text;
  minutes_left numeric;
  allocation integer;
begin
  if auth.uid() is null then raise exception 'Silakan masuk dahulu.' using errcode='42501'; end if;
  if (select count(*) from public.follows where following_id=auth.uid()) < 100
    and lower(coalesce(current_setting('request.jwt.claim.email',true),'')) not in ('okttawdr@gmail.com','shusensei27@gmail.com') then
    raise exception 'Butuh minimal 100 pengikut untuk mulai live.' using errcode='42501';
  end if;
  perform public.check_rate('live_start',3,3600);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('octgram-quota:'||month_key,0));
  select coalesce((select su.minutes_used from public.stream_usage su where su.provider='agora' and su.month=month_key),0) into agora_used;
  select coalesce((select su.minutes_used from public.stream_usage su where su.provider='livekit' and su.month=month_key),0) into livekit_used;
  if agora_available and agora_used <= agora_safe-1 then
    chosen := 'agora'; minutes_left := agora_safe-agora_used;
  elsif livekit_available and livekit_used <= livekit_safe-1 then
    chosen := 'livekit'; minutes_left := livekit_safe-livekit_used;
  else
    raise exception 'Live sedang tidak tersedia saat ini. Coba lagi nanti.';
  end if;
  allocation := least(90,greatest(1,floor(minutes_left)::integer));
  update public.live_streams set status='ended',ended_at=now() where host_id=auth.uid() and status='live';
  insert into public.live_streams(host_id,title,room_name,provider,session_minutes)
    values(auth.uid(),coalesce(nullif(trim(title_value),''),'Live'),'oct_'||replace(gen_random_uuid()::text,'-',''),chosen,allocation)
    returning * into stream_row;
  insert into public.stream_reservations(stream_id,user_id,provider,month,reserved_minutes)
    values(stream_row.id,auth.uid(),chosen,month_key,allocation);
  insert into public.stream_usage(provider,month,minutes_used) values(chosen,month_key,allocation)
    on conflict(provider,month) do update set minutes_used=public.stream_usage.minutes_used+excluded.minutes_used;
  insert into public.notifications(user_id,actor_id,kind,post_id,entity)
    select f.follower_id,auth.uid(),'live',null,stream_row.id::text from public.follows f where f.following_id=auth.uid();
  return jsonb_build_object('id',stream_row.id,'title',stream_row.title,'room_name',stream_row.room_name,
    'provider',stream_row.provider,'session_minutes',stream_row.session_minutes,'reservation_minutes',allocation,
    'status',stream_row.status,'started_at',stream_row.started_at,'host',jsonb_build_object('id',auth.uid()));
end $$;

revoke execute on function public.set_follow(uuid,boolean),public.set_like(bigint,boolean),public.set_bookmark(bigint,boolean),public.publish_post(text,jsonb,uuid,smallint,text),public.edit_post(bigint,text,smallint),public.archive_post(bigint,boolean),public.delete_post(bigint),public.set_repost(bigint,boolean),public.add_comment(bigint,text,bigint),public.start_chat(uuid),public.send_message(uuid,text,uuid,text,bigint),public.feed(bigint,uuid),public.explore_feed(bigint),public.saved_feed(bigint),public.post_view(bigint),public.post_collaborators(bigint),public.post_likes(bigint,timestamptz),public.follow_list(uuid,text,timestamptz),public.db_stats() from public,anon;
grant execute on function public.set_follow(uuid,boolean),public.set_like(bigint,boolean),public.set_bookmark(bigint,boolean),public.publish_post(text,jsonb,uuid,smallint,text),public.edit_post(bigint,text,smallint),public.archive_post(bigint,boolean),public.delete_post(bigint),public.set_repost(bigint,boolean),public.add_comment(bigint,text,bigint),public.start_chat(uuid),public.send_message(uuid,text,uuid,text,bigint),public.feed(bigint,uuid),public.explore_feed(bigint),public.saved_feed(bigint),public.post_view(bigint),public.post_collaborators(bigint),public.post_likes(bigint,timestamptz),public.follow_list(uuid,text,timestamptz),public.db_stats() to authenticated;

commit;
