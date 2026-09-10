import { createHmac, timingSafeEqual } from "node:crypto";

function matches(rawBody, secret, signature, algorithm) {
  if (!signature) return false;
  const expected = createHmac(algorithm, secret).update(rawBody).digest("hex");
  const actual = String(signature).trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(actual)) return false;
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(actual, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyAgoraWebhookSignature(rawBody, secret, signatures = {}) {
  if (!secret) return false;
  return matches(rawBody, secret, signatures.v2, "sha256") || matches(rawBody, secret, signatures.v1, "sha1");
}
