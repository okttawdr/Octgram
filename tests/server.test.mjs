import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createApp } from "../server/app.mjs";

async function serve(options) {
  const server = createServer(createApp(options));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

test("health endpoint is public and sends security headers", async (t) => {
  const app = await serve({ config: { allowedOrigin: "http://localhost:5173", maxBodyBytes: 1024 }, gateway: {}, router: async () => null });
  t.after(app.close);
  const response = await fetch(`${app.url}/api/health`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(await response.json(), { data: { status: "ok", service: "octgram-api" } });
});

test("protected API rejects missing bearer token", async (t) => {
  const app = await serve({ config: { allowedOrigin: "http://localhost:5173", maxBodyBytes: 1024 }, gateway: { authenticate: async () => null }, router: async () => ({ data: true }) });
  t.after(app.close);
  const response = await fetch(`${app.url}/api/me`);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: { code: "UNAUTHENTICATED", message: "Sesi tidak valid. Silakan masuk kembali." } });
});

test("authenticated request forwards verified identity and parsed JSON", async (t) => {
  const router = async ({ user, method, pathname, body }) => ({ status: 201, data: { userId: user.id, method, pathname, body } });
  const gateway = { authenticate: async (token) => token === "valid-token" ? { id: "user-1" } : null };
  const app = await serve({ config: { allowedOrigin: "http://localhost:5173", maxBodyBytes: 1024 }, gateway, router });
  t.after(app.close);
  const response = await fetch(`${app.url}/api/echo`, { method: "POST", headers: { authorization: "Bearer valid-token", "content-type": "application/json", origin: "http://localhost:5173" }, body: JSON.stringify({ value: 7 }) });
  assert.equal(response.status, 201);
  assert.deepEqual((await response.json()).data, { userId: "user-1", method: "POST", pathname: "/api/echo", body: { value: 7 } });
});

test("mutation rejects a foreign origin and oversized body", async (t) => {
  const options = { config: { allowedOrigin: "https://octgram.example", maxBodyBytes: 16 }, gateway: { authenticate: async () => ({ id: "user-1" }) }, router: async () => ({ data: true }) };
  const app = await serve(options);
  t.after(app.close);
  const foreign = await fetch(`${app.url}/api/echo`, { method: "POST", headers: { authorization: "Bearer x", "content-type": "application/json", origin: "https://evil.example" }, body: "{}" });
  assert.equal(foreign.status, 403);
  const large = await fetch(`${app.url}/api/echo`, { method: "POST", headers: { authorization: "Bearer x", "content-type": "application/json", origin: "https://octgram.example" }, body: JSON.stringify({ value: "12345678901234567890" }) });
  assert.equal(large.status, 413);
});
