import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("legacy schema can be upgraded without losing profiles", async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role; create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email',current_setting('request.jwt.claim.email',true)) $$;
    grant usage on schema auth,storage to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text,created_at timestamptz default now());
    alter table storage.objects enable row level security; grant select,insert,delete on storage.objects to authenticated;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
    create function storage.extension(text) returns text language sql immutable as $$ select reverse(split_part(reverse($1),'.',1)) $$;
  `);
  const legacy = (await readFile(new URL("../supabase/migrations/001_octgram.sql", import.meta.url), "utf8"))
    .replace("alter publication supabase_realtime add table public.messages;", "")
    .replace("alter publication supabase_realtime add table public.notifications;", "");
  await db.exec(legacy);
  const id = "40000000-0000-4000-8000-000000000004";
  await db.query("insert into auth.users(id) values($1)", [id]);
  await db.exec(await readFile(new URL("../supabase/upgrades/002_harden_existing.sql", import.meta.url), "utf8"));
  assert.equal((await db.query("select count(*)::int as count from public.profiles")).rows[0].count, 1);
  assert.equal((await db.query("select count(*)::int as count from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='updated_at'")).rows[0].count, 1);
  const googleId = "50000000-0000-4000-8000-000000000005";
  await db.query("insert into auth.users(id,raw_user_meta_data) values($1,$2)", [googleId, JSON.stringify({ name: "Google Upgrade" })]);
  assert.equal((await db.query("select display_name from public.profiles where id=$1", [googleId])).rows[0].display_name, "Google Upgrade");
  for (const name of ["003_livestream.sql", "004_grid_and_caps.sql", "005_agora_streaming.sql", "006_chat_media_reply.sql", "007_social_and_monitoring.sql", "008_archived_feed.sql", "009_post_reposters.sql", "010_view_once_media.sql", "011_admin_access.sql", "012_live_device_lock.sql"]) {
    const sql = (await readFile(new URL(`../supabase/upgrades/${name}`, import.meta.url), "utf8"))
      .replace(/alter publication supabase_realtime add table public\.[a-z_]+;/g, "");
    await db.exec(sql);
  }
  assert.equal((await db.query("select count(*)::int as count from information_schema.columns where table_schema='public' and table_name='messages' and column_name='media_once'")).rows[0].count, 1);
  assert.equal((await db.query("select public.is_octgram_admin() as allowed")).rows[0].allowed, false);
  await db.close();
});
