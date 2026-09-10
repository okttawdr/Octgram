-- Adds: cover/thumbnail selection, follower-gated upload cap (8 photos under
-- 100 followers, 20 at/above), 1 MB per-photo storage cap. Run after
-- 001_octgram.sql / 002_harden_existing.sql / 003_livestream.sql.
begin;

alter table public.posts add column if not exists thumbnail_index smallint not null default 0;

do $$
declare r record;
begin
  for r in select conname from pg_constraint where conrelid='public.posts'::regclass and contype='c' and pg_get_constraintdef(oid) like '%jsonb_array_length(media)%'
  loop
    execute format('alter table public.posts drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.posts drop constraint if exists posts_media_check;
alter table public.posts add constraint posts_media_check
  check(jsonb_typeof(media)='array' and jsonb_array_length(media) between 1 and 20 and octet_length(media::text)<=8192);

create or replace function public.publish_post(caption_value text,media_value jsonb,request_id uuid,thumbnail_value smallint default 0)
returns bigint language plpgsql security definer set search_path='' as $$
declare item jsonb; pid bigint; followers integer; cap integer;
begin
 if auth.uid() is null then raise exception 'Silakan masuk dahulu'; end if;
 if request_id is null then raise exception 'Request ID tidak valid'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||request_id::text,0));
 select id into pid from public.posts where user_id=auth.uid() and client_id=request_id; if pid is not null then return pid; end if;
 perform public.check_rate('post',10,86400);
 select count(*) into followers from public.follows where following_id=auth.uid();
 cap := case when followers>=100 then 20 else 8 end;
 if jsonb_typeof(media_value)<>'array' or jsonb_array_length(media_value) not between 1 and cap then raise exception 'Pilih 1–% foto',cap; end if;
 if thumbnail_value not between 0 and jsonb_array_length(media_value)-1 then raise exception 'Thumbnail tidak valid'; end if;
 for item in select value from jsonb_array_elements(media_value) loop
  if jsonb_typeof(item) is distinct from 'object' or not (item ?& array['path','width','height','bytes'])
   or jsonb_typeof(item->'path') is distinct from 'string' or jsonb_typeof(item->'width') is distinct from 'number' or jsonb_typeof(item->'height') is distinct from 'number' or jsonb_typeof(item->'bytes') is distinct from 'number'
   or (item->>'width')::integer not between 1 and 16000 or (item->>'height')::integer not between 1 and 16000 or (item->>'bytes')::integer not between 1 and 1150000
   or item->>'path' not like 'octgram/posts/'||auth.uid()::text||'\_%' escape '\'
  then raise exception 'Media tidak valid, belum terunggah, atau melebihi 1 MB'; end if;
 end loop;
 insert into public.posts(user_id,caption,media,thumbnail_index,client_id) values(auth.uid(),coalesce(caption_value,''),media_value,thumbnail_value,request_id) returning id into pid;
 perform public.notify_mentions(coalesce(caption_value,''),pid,'p:'||pid); return pid;
end $$;

revoke execute on function public.publish_post(text,jsonb,uuid,smallint) from public,anon;
grant execute on function public.publish_post(text,jsonb,uuid,smallint) to authenticated;

create or replace function public.feed(before_id bigint default null,author_id uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'user_id',p.user_id,'caption',p.caption,'media',p.media,'thumbnail_index',p.thumbnail_index,'created_at',p.created_at,'author',jsonb_build_object('id',pr.id,'username',pr.username,'display_name',pr.display_name,'avatar_path',pr.avatar_path),'like_count',(select count(*) from public.likes l where l.post_id=p.id),'comment_count',(select count(*) from public.comments c where c.post_id=p.id),'liked',exists(select 1 from public.likes l where l.post_id=p.id and l.user_id=auth.uid()),'bookmarked',exists(select 1 from public.bookmarks b where b.post_id=p.id and b.user_id=auth.uid())) order by p.id desc),'[]'::jsonb)
 from (select * from public.posts p where (before_id is null or p.id<before_id) and ((author_id is not null and p.user_id=author_id) or (author_id is null and (p.user_id=auth.uid() or exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.following_id=p.user_id)))) order by p.id desc limit 10) p join public.profiles pr on pr.id=p.user_id;
$$;
create or replace function public.explore_feed(before_id bigint default null) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'user_id',p.user_id,'caption',p.caption,'media',p.media,'thumbnail_index',p.thumbnail_index,'created_at',p.created_at,'author',jsonb_build_object('id',pr.id,'username',pr.username,'display_name',pr.display_name,'avatar_path',pr.avatar_path),'like_count',(select count(*) from public.likes l where l.post_id=p.id),'comment_count',(select count(*) from public.comments c where c.post_id=p.id),'liked',exists(select 1 from public.likes l where l.post_id=p.id and l.user_id=auth.uid()),'bookmarked',exists(select 1 from public.bookmarks b where b.post_id=p.id and b.user_id=auth.uid())) order by p.id desc),'[]'::jsonb)
 from (select * from public.posts p where before_id is null or p.id<before_id order by p.id desc limit 10) p join public.profiles pr on pr.id=p.user_id;
$$;
create or replace function public.saved_feed(before_id bigint default null) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'user_id',p.user_id,'caption',p.caption,'media',p.media,'thumbnail_index',p.thumbnail_index,'created_at',p.created_at,'author',jsonb_build_object('id',pr.id,'username',pr.username,'display_name',pr.display_name,'avatar_path',pr.avatar_path),'like_count',(select count(*) from public.likes l where l.post_id=p.id),'comment_count',(select count(*) from public.comments c where c.post_id=p.id),'liked',exists(select 1 from public.likes l where l.post_id=p.id and l.user_id=auth.uid()),'bookmarked',true) order by p.id desc),'[]'::jsonb)
 from (select * from public.bookmarks where user_id=auth.uid() and (before_id is null or post_id<before_id) order by post_id desc limit 10) b join public.posts p on p.id=b.post_id join public.profiles pr on pr.id=p.user_id;
$$;

commit;
