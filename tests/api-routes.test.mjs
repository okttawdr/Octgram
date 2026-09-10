import test from "node:test";
import assert from "node:assert/strict";
import { routeRequest } from "../server/routes.mjs";

const context = (method, path, body, query = "") => ({
  method,
  pathname: path,
  body,
  searchParams: new URLSearchParams(query),
  user: { id: "00000000-0000-4000-8000-000000000001" },
});

test("feed route maps bounded cursor and scope to repository", async () => {
  const calls = [];
  const repository = { feed: async (...args) => { calls.push(args); return [{ id: 12 }]; } };
  const result = await routeRequest({ ...context("GET", "/api/feed", undefined, "scope=explore&beforeId=25"), repository });
  assert.deepEqual(calls, [["explore", 25, null]]);
  assert.deepEqual(result, { data: [{ id: 12 }] });
});

test("post route rejects malformed media before reaching database", async () => {
  const repository = { publishPost: async () => assert.fail("repository must not be called") };
  await assert.rejects(
    routeRequest({ ...context("POST", "/api/posts", { caption: "x", media: [], requestId: "bad" }), repository }),
    (error) => error.status === 422 && error.code === "VALIDATION_ERROR",
  );
});

test("like route maps explicit boolean and numeric post id", async () => {
  const calls = [];
  const repository = { setLike: async (...args) => calls.push(args) };
  const result = await routeRequest({ ...context("POST", "/api/posts/42/like", { enabled: true }), repository });
  assert.deepEqual(calls, [[42, true]]);
  assert.deepEqual(result, { data: null });
});

test("unknown endpoint returns no result for HTTP layer 404", async () => {
  assert.equal(await routeRequest({ ...context("GET", "/api/unknown"), repository: {} }), null);
});

test("profile search rejects a query that is empty after sanitizing", async () => {
  const repository = { searchProfiles: async () => assert.fail("repository must not be called") };
  await assert.rejects(
    routeRequest({ ...context("GET", "/api/profiles", undefined, "q=%40%40"), repository }),
    (error) => error.status === 422 && error.code === "VALIDATION_ERROR",
  );
});

test("profile update forwards only editable fields", async () => {
  let saved;
  const repository = { updateProfile: async (_id, value) => { saved = value; return value; } };
  await routeRequest({ ...context("PATCH", "/api/me", { username: "valid_name", display_name: "Name", role: "admin", id: "attacker" }), repository });
  assert.deepEqual(saved, { username: "valid_name", display_name: "Name" });
});
