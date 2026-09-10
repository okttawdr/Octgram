-- Upgrade only for databases previously created with migrations/001_octgram.sql.
-- Do not run this after schema.sql.
begin;

alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.posts add column if not exists updated_at timestamptz not null default now();
alter table public.comments add column if not exists updated_at timestamptz not null default now();
alter table public.follows add column if not exists created_at timestamptz not null default now();
alter table public.likes add column if not exists created_at timestamptz not null default now();

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end $$;
drop trigger if exists profiles_touch on public.profiles;
drop trigger if exists posts_touch on public.posts;
drop trigger if exists comments_touch on public.comments;
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

revoke execute on function public.touch_updated_at(),public.handle_new_user() from public,anon,authenticated;
grant update(updated_at) on public.profiles to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('photos','photos',true,5242880,array['image/webp'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists octgram_upload on storage.objects;
create policy octgram_upload on storage.objects for insert to authenticated
with check(
 bucket_id='photos'
 and (storage.foldername(name))[1]=(select auth.uid())::text
 and lower(storage.extension(name))='webp'
 and owner_id=(select auth.uid())::text
 and (select public.storage_capacity())
);

commit;
