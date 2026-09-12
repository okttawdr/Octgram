-- 012: live lifecycle yang deterministik dan hanya dapat dikontrol satu perangkat.
-- Jalankan setelah 011_admin_access.sql.
begin;

alter table public.live_streams add column if not exists host_device_id uuid;

-- Sesi lama tidak memiliki identitas perangkat dan tidak aman untuk dilanjutkan.
update public.live_streams
set status='ended', ended_at=coalesce(ended_at,now())
where status='live' and host_device_id is null;

drop function if exists public.start_live(text,boolean,boolean);
drop function if exists public.join_live(bigint);
drop function if exists public.end_live(bigint);

create or replace function public.start_live(title_value text,agora_available boolean,livekit_available boolean,device_value uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 stream_row public.live_streams; active_row public.live_streams; month_key text:=to_char(now(),'YYYY-MM');
 agora_used numeric:=0; livekit_used numeric:=0; chosen text; minutes_left numeric; allocation integer; reserved integer;
begin
 if auth.uid() is null then raise exception 'Silakan masuk dahulu.' using errcode='42501'; end if;
 if device_value is null then raise exception 'Identitas perangkat tidak valid.' using errcode='42501'; end if;
 if (select count(*) from public.follows where following_id=auth.uid())<100 and not public.is_octgram_admin() then
  raise exception 'Butuh minimal 100 pengikut untuk mulai live.' using errcode='42501';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('octgram-live-host:'||auth.uid()::text,0));
 update public.live_streams set status='ended',ended_at=coalesce(ended_at,now())
  where host_id=auth.uid() and status='live' and now()>=started_at+make_interval(mins=>session_minutes);
 select * into active_row from public.live_streams where host_id=auth.uid() and status='live' limit 1;
 if active_row.id is not null then
  if active_row.host_device_id is distinct from device_value then
   raise exception 'Live akun ini sedang aktif di perangkat lain.' using errcode='42501';
  end if;
  select reserved_minutes into reserved from public.stream_reservations where stream_id=active_row.id and user_id=auth.uid();
  return public.live_stream(active_row.id)||jsonb_build_object('reservation_minutes',coalesce(reserved,active_row.session_minutes));
 end if;
 perform public.check_rate('live_start',3,3600);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('octgram-quota:'||month_key,0));
 select coalesce((select minutes_used from public.stream_usage where provider='agora' and month=month_key),0) into agora_used;
 select coalesce((select minutes_used from public.stream_usage where provider='livekit' and month=month_key),0) into livekit_used;
 if agora_available and agora_used<=8899 then chosen:='agora'; minutes_left:=8900-agora_used;
 elsif livekit_available and livekit_used<=3999 then chosen:='livekit'; minutes_left:=4000-livekit_used;
 else raise exception 'Live sedang tidak tersedia saat ini. Coba lagi nanti.'; end if;
 allocation:=least(90,greatest(1,floor(minutes_left)::integer));
 insert into public.live_streams(host_id,title,room_name,provider,session_minutes,host_device_id)
  values(auth.uid(),coalesce(nullif(trim(title_value),''),'Live'),'oct_'||replace(gen_random_uuid()::text,'-',''),chosen,allocation,device_value)
  returning * into stream_row;
 insert into public.stream_reservations(stream_id,user_id,provider,month,reserved_minutes)
  values(stream_row.id,auth.uid(),chosen,month_key,allocation);
 insert into public.stream_usage(provider,month,minutes_used) values(chosen,month_key,allocation)
  on conflict(provider,month) do update set minutes_used=public.stream_usage.minutes_used+excluded.minutes_used;
 insert into public.notifications(user_id,actor_id,kind,post_id,entity)
  select f.follower_id,auth.uid(),'live',null,stream_row.id::text from public.follows f where f.following_id=auth.uid();
 return public.live_stream(stream_row.id)||jsonb_build_object('reservation_minutes',allocation);
end $$;

create or replace function public.join_live(target bigint,device_value uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare stream_row public.live_streams; month_key text:=to_char(now(),'YYYY-MM'); remaining integer; already_reserved integer; used numeric; safe_cap numeric; result jsonb;
begin
 if auth.uid() is null then raise exception 'Silakan masuk dahulu.' using errcode='42501'; end if;
 select * into stream_row from public.live_streams where id=target;
 if stream_row.id is null then return null; end if;
 if stream_row.host_id=auth.uid() and stream_row.host_device_id is distinct from device_value then
  raise exception 'Live ini sedang dikontrol dari perangkat lain.' using errcode='42501';
 end if;
 if stream_row.status<>'live' or now()>=stream_row.started_at+make_interval(mins=>stream_row.session_minutes) then
  update public.live_streams set status='ended',ended_at=coalesce(ended_at,now()) where id=target and status='live';
  raise exception 'Live sudah berakhir.';
 end if;
 select reserved_minutes into already_reserved from public.stream_reservations where stream_id=target and user_id=auth.uid();
 if already_reserved is null then
  remaining:=greatest(1,ceil(stream_row.session_minutes-extract(epoch from (now()-stream_row.started_at))/60.0)::integer);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('octgram-quota:'||month_key,0));
  select reserved_minutes into already_reserved from public.stream_reservations where stream_id=target and user_id=auth.uid();
  if already_reserved is null then
   select coalesce((select minutes_used from public.stream_usage where provider=stream_row.provider and month=month_key),0) into used;
   safe_cap:=case stream_row.provider when 'agora' then 8900 else 4000 end;
   if used+remaining>safe_cap then raise exception 'Live sedang tidak tersedia saat ini. Coba lagi nanti.'; end if;
   insert into public.stream_reservations(stream_id,user_id,provider,month,reserved_minutes) values(target,auth.uid(),stream_row.provider,month_key,remaining);
   insert into public.stream_usage(provider,month,minutes_used) values(stream_row.provider,month_key,remaining)
    on conflict(provider,month) do update set minutes_used=public.stream_usage.minutes_used+excluded.minutes_used;
   already_reserved:=remaining;
  end if;
 end if;
 result:=public.live_stream(target);
 return result||jsonb_build_object('reservation_minutes',already_reserved);
end $$;

create or replace function public.end_live(target bigint,device_value uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare stream_row public.live_streams;
begin
 select * into stream_row from public.live_streams where id=target and host_id=auth.uid();
 if stream_row.id is null or stream_row.status='ended' then return null; end if;
 if stream_row.host_device_id is distinct from device_value then
  raise exception 'Live ini hanya dapat diakhiri dari perangkat yang memulainya.' using errcode='42501';
 end if;
 update public.live_streams set status='ended',ended_at=now() where id=target returning * into stream_row;
 return jsonb_build_object('id',stream_row.id,'provider',stream_row.provider,'room_name',stream_row.room_name);
end $$;

create or replace function public.live_status(target bigint)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'status',case when status='live' and now()<started_at+make_interval(mins=>session_minutes) then 'live' else 'ended' end)
 from public.live_streams where id=target;
$$;

revoke execute on function public.start_live(text,boolean,boolean,uuid),public.join_live(bigint,uuid),public.end_live(bigint,uuid),public.live_status(bigint) from public,anon;
grant execute on function public.start_live(text,boolean,boolean,uuid),public.join_live(bigint,uuid),public.end_live(bigint,uuid),public.live_status(bigint) to authenticated;

commit;
