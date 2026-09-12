import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("view-once migration enforces private storage and receiver-only disposal", async () => {
  const sql = await readFile(new URL("../supabase/upgrades/010_view_once_media.sql", import.meta.url), "utf8");
  assert.match(sql, /values\('chat-once','chat-once',false/);
  assert.match(sql, /m\.sender_id<>auth\.uid\(\)/);
  assert.match(sql, /delete from public\.messages where id=target/);
  assert.match(sql, /delete from storage\.objects where bucket_id='chat-once'/);
  assert.doesNotMatch(sql, /intolid|allocation melt/i);
});

test("admin migration recognizes both trusted emails and usernames", async () => {
  const sql = await readFile(new URL("../supabase/upgrades/011_admin_access.sql", import.meta.url), "utf8");
  for (const identity of ["okttawdr@gmail.com", "shusensei27@gmail.com", "okta_bringass", "octaxyzz_"]) assert.match(sql, new RegExp(identity.replace(".", "\\.")));
  assert.match(sql, /not public\.is_octgram_admin\(\)/);
  assert.doesNotMatch(sql, /intolid|allocation melt/i);
});

test("routing hooks live only inside stable page components", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const shell = app.slice(app.indexOf("function Shell"), app.indexOf("function PostLikesPage"));
  assert.equal((shell.match(/useLoad\(/g) || []).length, 1);
  assert.match(app, /function PostLikesPage[\s\S]*useLoad/);
  assert.match(app, /function FollowListPage[\s\S]*useLoad/);
});
