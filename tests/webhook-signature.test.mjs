import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { verifyAgoraWebhookSignature } from "../server/webhook-signature.mjs";

test("Agora webhook requires a secret and accepts v1/v2 algorithms", () => {
  const raw = '{"event":"channel destroy"}';
  const secret = "test-secret";
  const v1 = createHmac("sha1", secret).update(raw).digest("hex");
  const v2 = createHmac("sha256", secret).update(raw).digest("hex");
  assert.equal(verifyAgoraWebhookSignature(raw, "", { v1, v2 }), false);
  assert.equal(verifyAgoraWebhookSignature(raw, secret, { v1 }), true);
  assert.equal(verifyAgoraWebhookSignature(raw, secret, { v2 }), true);
  assert.equal(verifyAgoraWebhookSignature(raw + "x", secret, { v2 }), false);
});
