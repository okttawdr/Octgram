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
