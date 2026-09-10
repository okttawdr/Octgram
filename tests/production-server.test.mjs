import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { createApp } from "../server/app.mjs";
import { createStaticHandler } from "../server/static.mjs";

test("production server serves health, assets, and SPA fallback", async (t) => {
  const dist = await mkdtemp(join(tmpdir(), "octgram-dist-"));
  await writeFile(join(dist, "index.html"), "<!doctype html><title>Octgram test</title>");
  await writeFile(join(dist, "asset.js"), "export default 1;");
  await writeFile(join(dist, "config.js"), "window.OCTGRAM_CONFIG = {};");
  const config = { allowedOrigin: "https://octgram.example", maxBodyBytes: 1024 };
  const server = createServer(createApp({ config, gateway: {}, router: async () => null, staticHandler: createStaticHandler(dist) }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  const asset = await fetch(`${base}/asset.js`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("content-type"), /javascript/);
  assert.equal((await fetch(`${base}/config.js`)).headers.get("cache-control"), "no-store");
  const page = await fetch(`${base}/profile/someone`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Octgram test/);
});
