-- Provider-aware livestreaming with conservative participant-minute reservations.
-- Run after 003_livestream.sql (and therefore after 002). Safe caps intentionally
-- leave headroom below provider plan limits. Verify current limits in each dashboard.
begin;

alter table public.live_streams add column if not exists provider text not null default 'agora'
  check(provider in ('agora','livekit'));
alter table public.live_streams add column if not exists session_minutes integer not null default 60
  check(session_minutes between 1 and 90);

create table if not exists public.stream_usage (
  provider text not null check(provider in ('agora','livekit')),
  month text not null,
  minutes_used numeric not null default 0 check(minutes_used>=0),
  primary key(provider,month)
);
create table if not exists public.stream_reservations (
  stream_id bigint not null references public.live_streams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check(provider in ('agora','livekit')),
  month text not null,
  reserved_minutes integer not null check(reserved_minutes between 1 and 90),
  created_at timestamptz not null default now(),
  primary key(stream_id,user_id)
);
alter table public.stream_usage enable row level security;
alter table public.stream_reservations enable row level security;
revoke all on public.stream_usage,public.stream_reservations from anon,authenticated;

drop function if exists public.start_live(text);
drop function if exists public.end_live();
drop function if exists public.record_stream_usage(text,numeric);

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
  if (select count(*) from public.follows where following_id=auth.uid()) < 100 then
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

create or replace function public.live_feed()
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'title',s.title,'room_name',s.room_name,'provider',s.provider,'started_at',s.started_at,
    'host',jsonb_build_object('id',p.id,'username',p.username,'display_name',p.display_name,'avatar_path',p.avatar_path)
  ) order by s.started_at desc),'[]'::jsonb)
  from public.live_streams s join public.profiles p on p.id=s.host_id where s.status='live';
$$;

create or replace function public.live_stream(target bigint)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'id',s.id,'title',s.title,'room_name',s.room_name,'provider',s.provider,'session_minutes',s.session_minutes,
    'status',s.status,'started_at',s.started_at,
    'host',jsonb_build_object('id',p.id,'username',p.username,'display_name',p.display_name,'avatar_path',p.avatar_path)
  ) from public.live_streams s join public.profiles p on p.id=s.host_id
  where s.id=target and (s.status='live' or s.host_id=(select auth.uid()));
$$;

create or replace function public.join_live(target bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  stream_row public.live_streams;
  month_key text := to_char(now(),'YYYY-MM');
  remaining integer;
  already_reserved integer;
  used numeric;
  safe_cap numeric;
  result jsonb;
begin
  if auth.uid() is null then raise exception 'Silakan masuk dahulu.' using errcode='42501'; end if;
  select * into stream_row from public.live_streams where id=target;
  if stream_row.id is null then return null; end if;
  if stream_row.status<>'live' or now()>=stream_row.started_at+make_interval(mins=>stream_row.session_minutes) then
    update public.live_streams set status='ended',ended_at=coalesce(ended_at,now()) where id=target and status='live';
    raise exception 'Live sedang tidak tersedia saat ini. Coba lagi nanti.';
  end if;
  select sr.reserved_minutes into already_reserved from public.stream_reservations sr where sr.stream_id=target and sr.user_id=auth.uid();
  if already_reserved is null then
    remaining := greatest(1,ceil(stream_row.session_minutes-extract(epoch from (now()-stream_row.started_at))/60.0)::integer);
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('octgram-quota:'||month_key,0));
    select sr.reserved_minutes into already_reserved from public.stream_reservations sr where sr.stream_id=target and sr.user_id=auth.uid();
    if already_reserved is not null then result := public.live_stream(target); return result||jsonb_build_object('reservation_minutes',already_reserved); end if;
    select coalesce((select su.minutes_used from public.stream_usage su where su.provider=stream_row.provider and su.month=month_key),0) into used;
    safe_cap := case stream_row.provider when 'agora' then 8900 else 4000 end;
    if used+remaining>safe_cap then raise exception 'Live sedang tidak tersedia saat ini. Coba lagi nanti.'; end if;
    insert into public.stream_reservations(stream_id,user_id,provider,month,reserved_minutes)
      values(target,auth.uid(),stream_row.provider,month_key,remaining);
    insert into public.stream_usage(provider,month,minutes_used) values(stream_row.provider,month_key,remaining)
      on conflict(provider,month) do update set minutes_used=public.stream_usage.minutes_used+excluded.minutes_used;
    already_reserved := remaining;
  end if;
  result := public.live_stream(target);
  return result||jsonb_build_object('reservation_minutes',already_reserved);
end $$;

create or replace function public.end_live(target bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare stream_row public.live_streams;
begin
  update public.live_streams set status='ended',ended_at=now()
    where id=target and host_id=auth.uid() and status='live' returning * into stream_row;
  if stream_row.id is null then return null; end if;
  return jsonb_build_object('id',stream_row.id,'provider',stream_row.provider,'room_name',stream_row.room_name);
end $$;

create or replace function public.reconcile_stream(room_value text)
returns void language sql security definer set search_path='' as $$
  update public.live_streams set status='ended',ended_at=now() where room_name=room_value and status='live';
$$;

revoke execute on function public.start_live(text,boolean,boolean),public.join_live(bigint),public.end_live(bigint),public.live_feed(),public.live_stream(bigint) from public,anon,authenticated;
revoke execute on function public.reconcile_stream(text) from public, anon, authenticated;
grant execute on function public.start_live(text,boolean,boolean),public.join_live(bigint),public.end_live(bigint),public.live_feed(),public.live_stream(bigint) to authenticated;
grant execute on function public.reconcile_stream(text) to service_role;

commit;
