import assert from "node:assert/strict";
import test from "node:test";
import { restoreVercelUrl } from "../server/vercel-url.mjs";

test("restores the original API path and preserves query parameters", () => {
  assert.equal(restoreVercelUrl("/api?__path=live%2F12&beforeId=4"), "/api/live/12?beforeId=4");
});

test("maps the dynamic config rewrite", () => {
  assert.equal(restoreVercelUrl("/api?__config=1"), "/config.js");
});
