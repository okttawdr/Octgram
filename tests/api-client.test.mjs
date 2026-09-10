import test from "node:test";
import assert from "node:assert/strict";
import { apiUrl } from "../src/services/api-core.mjs";

test("API URL encodes query values and omits empty values", () => {
  assert.equal(apiUrl("/feed", { scope: "profile", authorId: "a/b", beforeId: null }, "/api"), "/api/feed?scope=profile&authorId=a%2Fb");
});

test("absolute API base is normalized without duplicate slash", () => {
  assert.equal(apiUrl("/me", {}, "https://api.example/v1/"), "https://api.example/v1/me");
});
