-- Livestreaming feature. Run AFTER schema.sql or 002_harden_existing.sql.
-- Video/audio transport is handled by LiveKit (see LIVESTREAM.md); this migration
-- only stores stream metadata, membership rules and "went live" notifications.
begin;

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
  if (select count(*) from public.follows where following_id=auth.uid()) < 100 then
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

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in ('like','comment','follow','mention','live'));

alter publication supabase_realtime add table public.live_streams;
commit;
