import test from "node:test";
import assert from "node:assert/strict";
import { authUrls, googleOAuthOptions, safeNextPath } from "../src/services/auth-core.mjs";

test("Google OAuth uses one exact PKCE callback without forced offline consent", () => {
  assert.deepEqual(googleOAuthOptions("https://octgram.example"), {
    provider: "google",
    options: { redirectTo: "https://octgram.example/auth/callback" },
  });
});

test("password recovery has a separate exact callback", () => {
  assert.deepEqual(authUrls("https://octgram.example/"), {
    callback: "https://octgram.example/auth/callback",
    recovery: "https://octgram.example/auth/recovery",
  });
});

test("post-login navigation rejects external and auth-loop destinations", () => {
  assert.equal(safeNextPath("/messages/abc"), "/messages/abc");
  assert.equal(safeNextPath("https://attacker.example"), "/");
  assert.equal(safeNextPath("//attacker.example"), "/");
  assert.equal(safeNextPath("/auth/callback"), "/");
});
