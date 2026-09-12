import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { readJson } from "../server/http.mjs";

test("readJson accepts chunked JSON without content-length", async () => {
  const request = Readable.from([Buffer.from('{"ok":true}')]);
  request.method = "POST";
  request.headers = { "content-type": "application/json", "transfer-encoding": "chunked" };
  assert.deepEqual(await readJson(request), { ok: true });
});

test("readJson accepts bodyless POST and DELETE requests", async () => {
  for (const method of ["POST", "DELETE"]) {
    const request = Readable.from([]);
    request.method = method;
    request.headers = {};
    assert.equal(await readJson(request), undefined);
  }
});
