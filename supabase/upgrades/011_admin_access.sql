-- 011: akses administrator yang konsisten berdasarkan akun Auth dan username.
-- Jalankan setelah 010_view_once_media.sql.
begin;

create or replace function public.is_octgram_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from auth.users u left join public.profiles p on p.id=u.id
  where u.id=auth.uid() and (
   lower(coalesce(u.email,'')) in ('okttawdr@gmail.com','shusensei27@gmail.com')
   or lower(coalesce(p.username,'')) in ('okta_bringass','octaxyzz_')
  )
 );
$$;
revoke execute on function public.is_octgram_admin() from public,anon;
grant execute on function public.is_octgram_admin() to authenticated;

create or replace function public.db_stats() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_octgram_admin() then return '{"allowed":false}'::jsonb; end if;
 return jsonb_build_object(
  'allowed',true,'profiles',(select count(*) from public.profiles),'posts',(select count(*) from public.posts),
  'archived_posts',(select count(*) from public.posts where archived),'likes',(select count(*) from public.likes),
  'comments',(select count(*) from public.comments),'follows',(select count(*) from public.follows),
  'bookmarks',(select count(*) from public.bookmarks),'reposts',(select count(*) from public.reposts),
  'collabs',(select count(*) from public.post_collabs),'messages',(select count(*) from public.messages),
  'conversations',(select count(*) from public.conversations),'notifications',(select count(*) from public.notifications),
  'live_streams',(select count(*) from public.live_streams),'storage_objects',(select count(*) from storage.objects where bucket_id in ('photos','chat-once')),
  'new_users_7d',(select count(*) from public.profiles where created_at>now()-interval '7 days'),
  'new_posts_24h',(select count(*) from public.posts where created_at>now()-interval '24 hours')
 );
end $$;

create or replace function public.start_live(title_value text,agora_available boolean,livekit_available boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare stream_row public.live_streams; month_key text:=to_char(now(),'YYYY-MM'); agora_used numeric:=0; livekit_used numeric:=0;
 agora_safe constant numeric:=8900; livekit_safe constant numeric:=4000; chosen text; minutes_left numeric; allocation integer;
begin
 if auth.uid() is null then raise exception 'Silakan masuk dahulu.' using errcode='42501'; end if;
 if (select count(*) from public.follows where following_id=auth.uid())<100 and not public.is_octgram_admin() then raise exception 'Butuh minimal 100 pengikut untuk mulai live.' using errcode='42501'; end if;
 perform public.check_rate('live_start',3,3600);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('octgram-quota:'||month_key,0));
 select coalesce((select minutes_used from public.stream_usage where provider='agora' and month=month_key),0) into agora_used;
 select coalesce((select minutes_used from public.stream_usage where provider='livekit' and month=month_key),0) into livekit_used;
 if agora_available and agora_used<=agora_safe-1 then chosen:='agora'; minutes_left:=agora_safe-agora_used;
 elsif livekit_available and livekit_used<=livekit_safe-1 then chosen:='livekit'; minutes_left:=livekit_safe-livekit_used;
 else raise exception 'Live sedang tidak tersedia saat ini. Coba lagi nanti.'; end if;
 allocation:=least(90,greatest(1,floor(minutes_left)::integer));
 update public.live_streams set status='ended',ended_at=now() where host_id=auth.uid() and status='live';
 insert into public.live_streams(host_id,title,room_name,provider,session_minutes) values(auth.uid(),coalesce(nullif(trim(title_value),''),'Live'),'oct_'||replace(gen_random_uuid()::text,'-',''),chosen,allocation)
 returning * into stream_row;
 insert into public.stream_reservations(stream_id,user_id,provider,month,reserved_minutes) values(stream_row.id,auth.uid(),chosen,month_key,allocation);
 insert into public.stream_usage(provider,month,minutes_used) values(chosen,month_key,allocation) on conflict(provider,month) do update set minutes_used=public.stream_usage.minutes_used+excluded.minutes_used;
 insert into public.notifications(user_id,actor_id,kind,post_id,entity) select f.follower_id,auth.uid(),'live',null,stream_row.id::text from public.follows f where f.following_id=auth.uid();
 return jsonb_build_object('id',stream_row.id,'title',stream_row.title,'room_name',stream_row.room_name,'provider',stream_row.provider,'session_minutes',stream_row.session_minutes,'reservation_minutes',allocation,'status',stream_row.status,'started_at',stream_row.started_at,'host',jsonb_build_object('id',auth.uid()));
end $$;

revoke execute on function public.db_stats(),public.start_live(text,boolean,boolean) from public,anon;
grant execute on function public.db_stats(),public.start_live(text,boolean,boolean) to authenticated;
commit;
