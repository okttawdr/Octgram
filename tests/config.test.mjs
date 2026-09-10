import test from "node:test";
import assert from "node:assert/strict";
import { resolvePublicConfig } from "../src/config-core.mjs";

test("runtime configuration overrides build-time configuration", () => {
  assert.deepEqual(
    resolvePublicConfig(
      { supabaseUrl: "https://runtime.supabase.co", supabaseAnonKey: "runtime-key", apiBaseUrl: "/runtime" },
      { VITE_SUPABASE_URL: "https://build.supabase.co", VITE_SUPABASE_ANON_KEY: "build-key", VITE_API_BASE_URL: "/build" },
    ),
    { supabaseUrl: "https://runtime.supabase.co", supabaseAnonKey: "runtime-key", apiBaseUrl: "/runtime", livekitUrl: "", cloudinaryCloudName: "", agoraAppId: "", configured: true },
  );
});

test("missing or placeholder Supabase values produce setup mode", () => {
  assert.equal(resolvePublicConfig({}, {}).configured, false);
  assert.equal(
    resolvePublicConfig(
      { supabaseUrl: "https://YOUR_PROJECT.supabase.co", supabaseAnonKey: "YOUR_KEY" },
      {},
    ).configured,
    false,
  );
});

test("invalid configured Supabase URL is rejected", () => {
  assert.throws(
    () => resolvePublicConfig({ supabaseUrl: "javascript:alert(1)", supabaseAnonKey: "public-key" }, {}),
    /HTTPS Supabase URL/,
  );
});
