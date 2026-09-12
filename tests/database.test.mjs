import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("PostgreSQL migration, permissions and application workflows", async (t) => {
  const db = new PGlite();
  await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create schema auth; create schema storage;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,storage to authenticated,anon;
 grant execute on function auth.uid() to authenticated,anon;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text,created_at timestamptz default now());
 alter table storage.objects enable row level security;
 grant select,insert,delete on storage.objects to authenticated;
 create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
 create function storage.extension(text) returns text language sql immutable as $$ select reverse(split_part(reverse($1),'.',1)) $$;
 `);
  const migration = (
    await readFile(
      new URL("../supabase/schema.sql", import.meta.url),
      "utf8",
    )
  )
    .replace(
      "alter publication supabase_realtime add table public.messages;",
      "-- Realtime transport is not available in PGlite.",
    )
    .replace(
      "alter publication supabase_realtime add table public.notifications;",
      "-- Realtime transport is not available in PGlite.",
    )
    .replace(
      "alter publication supabase_realtime add table public.live_streams;",
      "-- Realtime transport is not available in PGlite.",
    );
  await db.exec(migration);
  const A = "00000000-0000-0000-0000-000000000001",
    B = "10000000-0000-0000-0000-000000000002",
    C = "20000000-0000-0000-0000-000000000003";
  const as = async (id, role = "authenticated") => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role " + role);
  };
  const scalar = async (sql, params = []) =>
    Object.values((await db.query(sql, params)).rows[0])[0];
  const D = "30000000-0000-4000-8000-000000000004";
  await db.query("insert into auth.users(id) values($1),($2),($3)", [A, B, C]);
  await db.query("update auth.users set email='okttawdr@gmail.com' where id=$1", [A]);
  await db.query("insert into auth.users(id,raw_user_meta_data) values($1,$2)", [D, JSON.stringify({ name: "Google User" })]);
  await db.query(
    "update public.profiles set username=case id when $1 then 'alice' when $2 then 'bobby' when $3 then 'carol' else username end",
    [A, B, C],
  );
  let pid, chat;
  await t.test("generated profiles and public helper permissions", async () => {
    assert.equal(await scalar("select count(*) from public.profiles"), 4);
    assert.equal(await scalar("select display_name from public.profiles where id=$1", [D]), "Google User");
    await as(A);
    await assert.rejects(
      db.exec("select public.check_rate('fake',999999,1)"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select public.notify($1,'follow',null,'fake')", [B]),
      /permission denied/,
    );
  });
  await t.test(
    "users cannot edit someone else or directly forge posts",
    async () => {
      await as(A);
      await db.query(
        "update public.profiles set display_name='hacked' where id=$1",
        [B],
      );
      assert.notEqual(
        await scalar("select display_name from public.profiles where id=$1", [
          B,
        ]),
        "hacked",
      );
      await assert.rejects(
        db.query("update public.profiles set id=$1 where id=$2", [C, A]),
        /permission denied/,
      );
      await assert.rejects(
        db.query(
          "insert into public.posts(user_id,caption,media,client_id) values($1,'x','[]',gen_random_uuid())",
          [A],
        ),
        /permission denied/,
      );
    },
  );
  await t.test(
    "storage ownership and media existence are enforced",
    async () => {
      await as(A);
      await assert.rejects(
        db.query(
          "insert into storage.objects(bucket_id,name,owner_id) values('photos',$1,$2)",
          [B + "/foreign.webp", A],
        ),
        /row-level security/,
      );
      await assert.rejects(
        db.query(
          "select public.publish_post('x',$1::jsonb,gen_random_uuid())",
          [
            JSON.stringify([
              { path: A + "/missing.webp", width: 10, height: 10, bytes: 100 },
            ]),
          ],
        ),
        /Media tidak valid/,
      );
      await db.query(
        "insert into storage.objects(bucket_id,name,owner_id) values('photos',$1,$2)",
        [A + "/photo.webp", A],
      );
    },
  );
  await t.test(
    "publish retry is idempotent and caption mentions notify once",
    async () => {
      await as(A);
      const media = JSON.stringify([
        { path: `octgram/posts/${A}_photo`, width: 100, height: 100, bytes: 1000 },
      ]);
      const req = "aaaaaaaa-0000-0000-0000-000000000001";
      pid = await scalar(
        "select public.publish_post('Halo @bobby', $1::jsonb,$2)",
        [media, req],
      );
      assert.equal(
        await scalar(
          "select public.publish_post('Halo @bobby', $1::jsonb,$2)",
          [media, req],
        ),
        pid,
      );
      assert.equal(await scalar("select count(*) from public.posts"), 1);
      await as(B);
      assert.equal(
        await scalar(
          "select count(*) from public.notifications where kind='mention'",
        ),
        1,
      );
      await as(A);
      assert.equal(
        await scalar("select count(*) from public.notifications"),
        0,
      );
    },
  );
  await t.test(
    "follow controls chronological feed, like is idempotent, replies validate parent",
    async () => {
      await as(B);
      assert.deepEqual(await scalar("select public.feed()"), []);
      await db.query("select public.set_follow($1,true)", [A]);
      assert.equal((await scalar("select public.feed()")).length, 1);
      await db.query("select public.set_like($1,true)", [pid]);
      await db.query("select public.set_like($1,true)", [pid]);
      assert.equal(await scalar("select count(*) from public.likes"), 1);
      await db.query("select public.set_bookmark($1,true)", [pid]);
      await db.query("select public.set_bookmark($1,true)", [pid]);
      assert.equal((await scalar("select public.saved_feed()"))[0].bookmarked, true);
      assert.equal((await scalar("select public.explore_feed()"))[0].id, pid);
      const cid = await scalar(
        "select public.add_comment($1,'Nice @alice',null)",
        [pid],
      );
      await as(A);
      await db.query("select public.add_comment($1,'Thanks',$2)", [pid, cid]);
      await assert.rejects(
        db.query("select public.add_comment($1,'x',999999)", [pid]),
        /induk tidak ditemukan/,
      );
      await db.query("delete from storage.objects where name=$1", [
        A + "/photo.webp",
      ]);
      assert.equal(await scalar("select count(*) from storage.objects"), 0);
    },
  );
  await t.test(
    "messages are private, sender cannot be spoofed and retry creates one row",
    async () => {
      await as(A);
      chat = await scalar("select public.start_chat($1)", [B]);
      const req = "bbbbbbbb-0000-0000-0000-000000000001";
      const mid = await scalar(
        "select public.send_message($1,'private message',$2)",
        [chat, req],
      );
      assert.equal(
        await scalar("select public.send_message($1,'private message',$2)", [
          chat,
          req,
        ]),
        mid,
      );
      await as(B);
      assert.equal(await scalar("select count(*) from public.messages"), 1);
      assert.equal(await scalar("select sender_id from public.messages"), A);
      await as(C);
      assert.deepEqual(await scalar("select public.saved_feed()"), []);
      await assert.rejects(
        db.query("insert into public.bookmarks(post_id,user_id) values($1,$2)", [pid, C]),
        /permission denied/,
      );
      assert.equal(await scalar("select count(*) from public.messages"), 0);
      assert.equal(
        await scalar("select count(*) from public.conversations"),
        0,
      );
      await assert.rejects(
        db.query(
          "select public.send_message($1,'intrusion',gen_random_uuid())",
          [chat],
        ),
        /tidak tersedia/,
      );
      await assert.rejects(
        db.query(
          "insert into public.messages(conversation_id,sender_id,body,client_id) values($1,$2,'spoof',gen_random_uuid())",
          [chat, A],
        ),
        /permission denied/,
      );
    },
  );
  await t.test("view-once media can only be opened by its recipient and is then removed", async () => {
    await as(A);
    assert.equal(await scalar("select public.is_octgram_admin()"), true);
    const path = `${A}/${chat}/50000000-0000-4000-8000-000000000006.webp`;
    await db.query("insert into storage.objects(bucket_id,name,owner_id) values('chat-once',$1,$2)", [path, A]);
    const mid = await scalar("select public.send_message($1,'',$2,$3,'image',true,null)", [chat, "60000000-0000-4000-8000-000000000007", path]);
    await assert.rejects(db.query("select public.open_once_media($1)", [mid]), /tidak tersedia/);
    await as(B);
    const opened = await scalar("select public.open_once_media($1)", [mid]);
    assert.equal(opened.path, path);
    await db.query("select public.finish_once_media($1)", [mid]);
    assert.equal(await scalar("select count(*) from public.messages where id=$1", [mid]), 0);
    await db.exec("reset role");
    assert.equal(await scalar("select count(*) from storage.objects where name=$1", [path]), 0);
  });
  await t.test("live host control is locked to the device that started it", async () => {
    const deviceA = "70000000-0000-4000-8000-000000000007";
    const deviceB = "80000000-0000-4000-8000-000000000008";
    await as(A);
    const started = await scalar("select public.start_live('Tes',true,false,$1)", [deviceA]);
    const repeated = await scalar("select public.start_live('Tes',true,false,$1)", [deviceA]);
    assert.equal(repeated.id, started.id);
    await assert.rejects(db.query("select public.start_live('Tes',true,false,$1)", [deviceB]), /perangkat lain/);
    await assert.rejects(db.query("select public.join_live($1,$2)", [started.id, deviceB]), /perangkat lain/);
    await assert.rejects(db.query("select public.end_live($1,$2)", [started.id, deviceB]), /perangkat yang memulainya/);
    await db.query("select public.end_live($1,$2)", [started.id, deviceA]);
    assert.equal((await scalar("select public.live_status($1)", [started.id])).status, "ended");
  });
  await t.test(
    "anonymous role cannot read profiles, messages or invoke mutations",
    async () => {
      await as("", "anon");
      await assert.rejects(
        db.exec("select * from public.profiles"),
        /permission denied/,
      );
      await assert.rejects(
        db.exec("select * from public.messages"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select public.set_follow($1,true)", [A]),
        /permission denied/,
      );
    },
  );
  await t.test("rate limits are enforced in the database", async () => {
    await as(A);
    for (let i = 0; i < 40; i++)
      await db.query("select public.set_follow($1,true)", [C]);
    await assert.rejects(
      db.query("select public.set_follow($1,true)", [C]),
      /Terlalu sering/,
    );
  });
  await t.test('malformed media cannot use null dimensions', async () => {
    await as(A);
    await assert.rejects(db.query("select public.publish_post('bad',$1::jsonb,gen_random_uuid())", [JSON.stringify([{path:A+'/photo.webp',width:null,height:10,bytes:100}])]), /Media tidak valid/);
  });
  await t.test('feed pages are bounded, ordered and do not overlap', async () => {
    await db.exec('reset role');
    const media=JSON.stringify([{path:`octgram/posts/${A}_photo`,width:100,height:100,bytes:1000}]);
    for(let i=0;i<12;i++) await db.query("insert into public.posts(user_id,caption,media,client_id) values($1,'pagination',$2::jsonb,gen_random_uuid())",[A,media]);
    await as(B);
    const first=await scalar('select public.feed()');
    assert.equal(first.length,10);
    assert.ok(first.every((p,i)=>i===0||p.id<first[i-1].id));
    const second=await scalar('select public.feed($1)',[first.at(-1).id]);
    assert.equal(second.length,3);
    assert.equal(new Set([...first,...second].map(p=>p.id)).size,13);
  });
  await db.close();
});
