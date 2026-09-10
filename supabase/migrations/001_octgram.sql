-- Run once in a NEW Supabase project's SQL Editor, or use Supabase CLI migrations.
begin;
create table public.profiles (
 id uuid primary key references auth.users on delete cascade,
 username text not null unique check(username ~ '^[a-z0-9_]{3,24}$'),
 display_name text not null default '' check(length(display_name)<=60),
 bio text not null default '' check(length(bio)<=160),
 website text not null default '' check(length(website)<=2048 and (website='' or website ~ '^https://')),
 avatar_path text,
 created_at timestamptz not null default now()
);
create table public.follows (
 follower_id uuid references public.profiles on delete cascade,
 following_id uuid references public.profiles on delete cascade,
 primary key(follower_id,following_id),check(follower_id<>following_id)
);
create index follows_reverse on public.follows(following_id);
create table public.posts (
 id bigint generated always as identity primary key,
 user_id uuid not null references public.profiles on delete cascade,
 caption text not null check(length(caption)<=2200),
 client_id uuid not null,
 unique(user_id,client_id),
 media jsonb not null check(jsonb_typeof(media)='array' and jsonb_array_length(media) between 1 and 5 and octet_length(media::text)<=4096),
 created_at timestamptz not null default now()
);
create index posts_author_id on public.posts(user_id,id desc);
create table public.likes (
 post_id bigint references public.posts on delete cascade,
 user_id uuid references public.profiles on delete cascade,
 primary key(post_id,user_id)
);
create table public.bookmarks (
 post_id bigint references public.posts on delete cascade,
 user_id uuid references public.profiles on delete cascade,
 created_at timestamptz not null default now(),
 primary key(post_id,user_id)
);
create index bookmarks_owner on public.bookmarks(user_id,created_at desc);
create table public.comments (
 id bigint generated always as identity primary key,
 post_id bigint not null references public.posts on delete cascade,
 user_id uuid not null references public.profiles on delete cascade,
 parent_id bigint references public.comments on delete cascade,
 body text not null check(length(trim(body)) between 1 and 1000),
 created_at timestamptz not null default now()
);
create index comments_post on public.comments(post_id,id desc);
create table public.notifications (
 id bigint generated always as identity primary key,
 user_id uuid not null references public.profiles on delete cascade,
 actor_id uuid not null references public.profiles on delete cascade,
 kind text not null check(kind in ('like','comment','follow','mention')),
 post_id bigint references public.posts on delete cascade,
 entity text not null,
 read_at timestamptz,
 created_at timestamptz not null default now(),
 unique(user_id,actor_id,kind,entity)
);
create index notifications_owner on public.notifications(user_id,id desc);
create table public.conversations (
 id uuid primary key default gen_random_uuid(),
 user_a uuid not null references public.profiles on delete cascade,
 user_b uuid not null references public.profiles on delete cascade,
 updated_at timestamptz not null default now(),
 unique(user_a,user_b),check(user_a<user_b)
);
create index conversations_b on public.conversations(user_b,updated_at desc);
create index conversations_a on public.conversations(user_a,updated_at desc);
create table public.messages (
 id bigint generated always as identity primary key,
 conversation_id uuid not null references public.conversations on delete cascade,
 sender_id uuid not null references public.profiles on delete cascade,
 body text not null check(length(trim(body)) between 1 and 2000),
 client_id uuid not null,
 created_at timestamptz not null default now(),
 unique(sender_id,client_id)
);
create index messages_conversation on public.messages(conversation_id,id desc);
create table public.rate_buckets (
 user_id uuid references public.profiles on delete cascade,
 action text, window_at timestamptz not null, hits integer not null,
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
revoke all on public.profiles,public.follows,public.posts,public.likes,public.bookmarks,public.comments,public.notifications,public.conversations,public.messages,public.rate_buckets from anon,authenticated;
grant select on public.profiles,public.follows,public.posts,public.likes,public.bookmarks,public.comments,public.notifications,public.conversations,public.messages to authenticated;
grant update(username,display_name,bio,website,avatar_path) on public.profiles to authenticated;
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

-- Generated usernames use 24 characters, including the prefix.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,username,display_name) values(new.id,'u_'||left(replace(new.id::text,'-',''),22),left(coalesce(new.raw_user_meta_data->>'full_name','Pengguna Octgram'),60));
 return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create function public.check_rate(a text,cap integer,seconds integer) returns void language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if auth.uid() is null then raise exception 'Silakan masuk dahulu'; end if;
 insert into public.rate_buckets as b values(auth.uid(),a,now(),1)
 on conflict(user_id,action) do update set
 hits=case when b.window_at < now()-make_interval(secs=>seconds) then 1 else b.hits+1 end,
 window_at=case when b.window_at < now()-make_interval(secs=>seconds) then now() else b.window_at end returning hits into n;
 if n>cap then raise exception 'Terlalu sering. Coba lagi sebentar.'; end if;
end $$;
create function public.notify(target uuid,kind_value text,post_value bigint,entity_value text) returns void language sql security definer set search_path='' as $$
 insert into public.notifications(user_id,actor_id,kind,post_id,entity)
 select target,auth.uid(),kind_value,post_value,entity_value where target is not null and target<>auth.uid()
 on conflict(user_id,actor_id,kind,entity) do nothing;
$$;
create function public.notify_mentions(body_value text,post_value bigint,entity_value text) returns void language sql security definer set search_path='' as $$
 insert into public.notifications(user_id,actor_id,kind,post_id,entity)
 select p.id,auth.uid(),'mention',post_value,entity_value from public.profiles p
 where p.username in (select lower(m[2]) from regexp_matches(body_value,'(^|[^a-zA-Z0-9_])@([a-zA-Z0-9_]{3,24})','g') m)
 and p.id<>auth.uid() on conflict(user_id,actor_id,kind,entity) do nothing;
$$;
create function public.set_follow(target uuid,enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.check_rate('follow',40,3600);
 if target=auth.uid() then raise exception 'Tidak dapat mengikuti diri sendiri'; end if;
 if enabled then
 insert into public.follows values(auth.uid(),target) on conflict do nothing;
 perform public.notify(target,'follow',null,auth.uid()::text);
 else delete from public.follows where follower_id=auth.uid() and following_id=target; end if;
end $$;
create function public.set_like(target bigint,enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.check_rate('like',180,3600);
 if enabled then
 insert into public.likes values(target,auth.uid()) on conflict do nothing;
 perform public.notify((select user_id from public.posts where id=target),'like',target,target::text);
 else delete from public.likes where post_id=target and user_id=auth.uid(); end if;
end $$;
create function public.set_bookmark(target bigint,enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.check_rate('bookmark',180,3600);
 if enabled then
 insert into public.bookmarks values(target,auth.uid(),now()) on conflict do nothing;
 else delete from public.bookmarks where post_id=target and user_id=auth.uid(); end if;
end $$;
create function public.publish_post(caption_value text,media_value jsonb,request_id uuid) returns bigint language plpgsql security definer set search_path='' as $$
declare item jsonb; pid bigint;
begin
 if auth.uid() is null then raise exception 'Silakan masuk dahulu'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||request_id::text,0));
 select id into pid from public.posts where user_id=auth.uid() and client_id=request_id;
 if pid is not null then return pid; end if;
 perform public.check_rate('post',10,86400);
 if jsonb_typeof(media_value)<>'array' or jsonb_array_length(media_value) not between 1 and 5 then raise exception 'Pilih 1–5 foto'; end if;
 for item in select value from jsonb_array_elements(media_value) loop
 if jsonb_typeof(item) is distinct from 'object' or not (item ?& array['path','width','height','bytes'])
 or jsonb_typeof(item->'path') is distinct from 'string' or jsonb_typeof(item->'width') is distinct from 'number'
 or jsonb_typeof(item->'height') is distinct from 'number' or jsonb_typeof(item->'bytes') is distinct from 'number' or (item->>'width')::integer not between 1 and 16000 or (item->>'height')::integer not between 1 and 16000
 or (item->>'bytes')::integer not between 1 and 5242880
 or item->>'path' not like auth.uid()::text||'/%.webp'
 or not exists(select 1 from storage.objects where bucket_id='photos' and name=item->>'path') then raise exception 'Media tidak valid atau belum terunggah'; end if;
 end loop;
 insert into public.posts(user_id,caption,media,client_id) values(auth.uid(),caption_value,media_value,request_id) returning id into pid;
 perform public.notify_mentions(caption_value,pid,'p:'||pid);
 return pid;
end $$;
create function public.add_comment(target bigint,body_value text,parent_value bigint default null) returns bigint language plpgsql security definer set search_path='' as $$
declare cid bigint; parent_owner uuid;
begin
 perform public.check_rate('comment',60,3600);
 if parent_value is not null then
 select user_id into parent_owner from public.comments where id=parent_value and post_id=target;
 if not found then raise exception 'Komentar induk tidak ditemukan'; end if;
 end if;
 insert into public.comments(post_id,user_id,parent_id,body) values(target,auth.uid(),parent_value,trim(body_value)) returning id into cid;
 perform public.notify((select user_id from public.posts where id=target),'comment',target,'c:'||cid);
 perform public.notify(parent_owner,'comment',target,'c:'||cid);
 perform public.notify_mentions(body_value,target,'c:'||cid);
 return cid;
end $$;
create function public.start_chat(target uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 perform public.check_rate('chat',30,3600);
 if target=auth.uid() then raise exception 'Pilih pengguna lain'; end if;
 insert into public.conversations(user_a,user_b) values(least(auth.uid(),target),greatest(auth.uid(),target))
 on conflict(user_a,user_b) do update set user_a=excluded.user_a returning id into cid;
 return cid;
end $$;
create function public.send_message(target uuid,body_value text,request_id uuid) returns bigint language plpgsql security definer set search_path='' as $$
declare mid bigint;
begin
 if auth.uid() is null or not exists(select 1 from public.conversations where id=target and auth.uid() in(user_a,user_b)) then raise exception 'Percakapan tidak tersedia'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||request_id::text,0));
 select id into mid from public.messages where sender_id=auth.uid() and client_id=request_id;
 if mid is not null then return mid; end if;
 perform public.check_rate('message',120,3600);
 insert into public.messages(conversation_id,sender_id,body,client_id) values(target,auth.uid(),trim(body_value),request_id) returning id into mid;
 update public.conversations set updated_at=now() where id=target;
 return mid;
end $$;
create function public.feed(before_id bigint default null,author_id uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'user_id',p.user_id,'caption',p.caption,'media',p.media,'created_at',p.created_at,
 'author',jsonb_build_object('id',pr.id,'username',pr.username,'display_name',pr.display_name,'avatar_path',pr.avatar_path),
 'like_count',(select count(*) from public.likes l where l.post_id=p.id),
 'comment_count',(select count(*) from public.comments c where c.post_id=p.id),
 'liked',exists(select 1 from public.likes l where l.post_id=p.id and l.user_id=auth.uid()),
 'bookmarked',exists(select 1 from public.bookmarks b where b.post_id=p.id and b.user_id=auth.uid())) order by p.id desc),'[]'::jsonb)
 from (select * from public.posts p where (before_id is null or p.id<before_id)
 and ((author_id is not null and p.user_id=author_id) or (author_id is null and (p.user_id=auth.uid() or exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.following_id=p.user_id))))
 order by p.id desc limit 10) p join public.profiles pr on pr.id=p.user_id;
$$;
create function public.explore_feed(before_id bigint default null) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'user_id',p.user_id,'caption',p.caption,'media',p.media,'created_at',p.created_at,
 'author',jsonb_build_object('id',pr.id,'username',pr.username,'display_name',pr.display_name,'avatar_path',pr.avatar_path),
 'like_count',(select count(*) from public.likes l where l.post_id=p.id),
 'comment_count',(select count(*) from public.comments c where c.post_id=p.id),
 'liked',exists(select 1 from public.likes l where l.post_id=p.id and l.user_id=auth.uid()),
 'bookmarked',exists(select 1 from public.bookmarks b where b.post_id=p.id and b.user_id=auth.uid())) order by p.id desc),'[]'::jsonb)
 from (select * from public.posts p where before_id is null or p.id<before_id order by p.id desc limit 10) p
 join public.profiles pr on pr.id=p.user_id;
$$;
create function public.saved_feed(before_id bigint default null) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'user_id',p.user_id,'caption',p.caption,'media',p.media,'created_at',p.created_at,
 'author',jsonb_build_object('id',pr.id,'username',pr.username,'display_name',pr.display_name,'avatar_path',pr.avatar_path),
 'like_count',(select count(*) from public.likes l where l.post_id=p.id),
 'comment_count',(select count(*) from public.comments c where c.post_id=p.id),
 'liked',exists(select 1 from public.likes l where l.post_id=p.id and l.user_id=auth.uid()),
 'bookmarked',true) order by p.id desc),'[]'::jsonb)
 from (select * from public.bookmarks where user_id=auth.uid() and (before_id is null or post_id<before_id) order by post_id desc limit 10) b
 join public.posts p on p.id=b.post_id join public.profiles pr on pr.id=p.user_id;
$$;
-- Helpers and trigger functions must never be directly callable by clients.
revoke execute on function public.handle_new_user(),public.check_rate(text,integer,integer),public.notify(uuid,text,bigint,text),public.notify_mentions(text,bigint,text) from public,anon,authenticated;
revoke execute on function public.set_follow(uuid,boolean),public.set_like(bigint,boolean),public.set_bookmark(bigint,boolean),public.publish_post(text,jsonb,uuid),public.add_comment(bigint,text,bigint),public.start_chat(uuid),public.send_message(uuid,text,uuid),public.feed(bigint,uuid),public.explore_feed(bigint),public.saved_feed(bigint) from public,anon;
grant execute on function public.set_follow(uuid,boolean),public.set_like(bigint,boolean),public.set_bookmark(bigint,boolean),public.publish_post(text,jsonb,uuid),public.add_comment(bigint,text,bigint),public.start_chat(uuid),public.send_message(uuid,text,uuid),public.feed(bigint,uuid),public.explore_feed(bigint),public.saved_feed(bigint) to authenticated;

-- Photos are PUBLIC. Octgram v1 does not offer private accounts.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('photos','photos',true,5242880,array['image/webp']);
-- Definer helper avoids recursive storage RLS. It exposes only the caller's capacity.
create function public.storage_capacity() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (select count(*) from storage.objects where bucket_id='photos' and owner_id=auth.uid()::text)<250;
$$;
revoke execute on function public.storage_capacity() from public,anon;
grant execute on function public.storage_capacity() to authenticated;
create policy octgram_upload on storage.objects for insert to authenticated with check(bucket_id='photos' and (storage.foldername(name))[1]=(select auth.uid())::text and lower(storage.extension(name))='webp' and (select public.storage_capacity()));
create policy octgram_own_objects on storage.objects for select to authenticated using(bucket_id='photos' and owner_id=(select auth.uid())::text);
create policy octgram_remove_unused on storage.objects for delete to authenticated using(bucket_id='photos' and owner_id=(select auth.uid())::text and not exists(select 1 from public.posts p, jsonb_array_elements(p.media) m where m->>'path'=name) and not exists(select 1 from public.profiles p where p.avatar_path=name));
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notifications;
commit;
