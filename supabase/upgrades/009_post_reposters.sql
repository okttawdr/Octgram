-- Upgrade 009: daftar siapa saja yang me-repost sebuah postingan (untuk
-- bubble avatar melayang di tombol repost). Jalankan di SQL Editor Supabase.
begin;

create or replace function public.post_reposters(target bigint) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('user',jsonb_build_object('id',pr.id,'username',pr.username,'display_name',pr.display_name,'avatar_path',pr.avatar_path),'created_at',r.created_at) order by r.created_at desc),'[]'::jsonb)
 from (select * from public.reposts where post_id=target order by created_at desc limit 8) r
 join public.profiles pr on pr.id=r.user_id;
$$;
revoke execute on function public.post_reposters(bigint) from public,anon;
grant execute on function public.post_reposters(bigint) to authenticated;

commit;