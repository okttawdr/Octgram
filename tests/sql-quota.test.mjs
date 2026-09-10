import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

for (const file of ["supabase/schema.sql", "supabase/upgrades/005_agora_streaming.sql"]) {
  test(`${file} has participant reservations and locked quota allocation`, async () => {
    const sql = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(sql, /create table if not exists public\.stream_reservations/i);
    assert.match(sql, /pg_advisory_xact_lock/i);
    assert.match(sql, /create or replace function public\.join_live/i);
    assert.doesNotMatch(sql, /\bmonth\s*=\s*month\b/i);
    assert.match(sql, /revoke execute on function public\.reconcile_stream\(text\) from public, anon, authenticated/i);
  });
}
