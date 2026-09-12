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

test("post creation forwards collaborator and delete maps to owner RPC", async () => {
  const calls = [];
  const repository = {
    publishPost: async (...args) => { calls.push(["publish", ...args]); return 91; },
    deletePost: async (...args) => { calls.push(["delete", ...args]); },
  };
  const media = [{ path: "octgram/posts/00000000-0000-4000-8000-000000000001_item", width: 100, height: 100, bytes: 1000 }];
  const requestId = "10000000-0000-4000-8000-000000000002";
  const created = await routeRequest({ ...context("POST", "/api/posts", { caption: "Halo", media, requestId, thumbnailIndex: 0, collabUsername: "octaxyzz_" }), repository });
  const removed = await routeRequest({ ...context("DELETE", "/api/posts/91"), repository });
  assert.equal(created.data, 91);
  assert.deepEqual(calls[0].slice(-2), [0, "octaxyzz_"]);
  assert.deepEqual(calls[1], ["delete", 91]);
  assert.deepEqual(removed, { data: null });
});

test("view-once media routes preserve private Supabase path and lifecycle", async () => {
  const calls = [];
  const repository = {
    sendMessage: async (...args) => { calls.push(["send", ...args]); return { id: 7 }; },
    openOnceMedia: async (...args) => { calls.push(["open", ...args]); return { path: "private", type: "image" }; },
    finishOnceMedia: async (...args) => { calls.push(["finish", ...args]); },
  };
  const conversation = "20000000-0000-4000-8000-000000000003";
  const requestId = "30000000-0000-4000-8000-000000000004";
  const mediaPath = `00000000-0000-4000-8000-000000000001/${conversation}/40000000-0000-4000-8000-000000000005.webp`;
  await routeRequest({ ...context("POST", `/api/conversations/${conversation}/messages`, { body: "", requestId, mediaPath, mediaType: "image", viewOnce: true, replyTo: null }), repository });
  await routeRequest({ ...context("POST", "/api/messages/7/media/open"), repository });
  await routeRequest({ ...context("DELETE", "/api/messages/7/media/finish"), repository });
  assert.deepEqual(calls[0], ["send", conversation, "", requestId, mediaPath, "image", true, null]);
  assert.deepEqual(calls.slice(1), [["open", 7], ["finish", 7]]);
});
