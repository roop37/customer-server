import assert from "assert/strict";
import { hashSwiggyUserId } from "../modules/dineout/util/identity";
import { buildDineoutAuditRecord } from "../modules/dineout/util/audit";

// Hash is deterministic, hex, and never echoes the plaintext id.
(() => {
  const id = "swiggy-user-9988";
  const h = hashSwiggyUserId(id);
  assert.equal(h, hashSwiggyUserId(id), "deterministic");
  assert.ok(/^[0-9a-f]{64}$/.test(h), "sha-256 hex");
  assert.notEqual(h, id);
  assert.ok(!h.includes(id), "no plaintext leak");
})();

// Audit record carries operational fields and NO PII / token / body.
(() => {
  const rec = buildDineoutAuditRecord({
    sessionId: "sess_1",
    tool: "search_restaurants_dineout",
    status: "200",
    latencyMs: 142,
    outcome: "ok",
    rateLimit: { limit: 70, remaining: 69, reset: 1790812800 },
    deprecationDetected: true,
  });
  assert.equal(rec.sessionId, "sess_1");
  assert.equal(rec.tool, "search_restaurants_dineout");
  assert.equal(rec.rateLimitRemaining, 69);
  assert.equal(rec.deprecationDetected, true);
  const keys = Object.keys(rec);
  for (const banned of [
    "token",
    "accessToken",
    "phone",
    "body",
    "request",
    "response",
    "args",
    "swiggyUserId",
  ]) {
    assert.ok(
      !keys.includes(banned),
      `audit record must not contain '${banned}'`
    );
  }
})();

console.log("swiggy-audit-identity.test.ts passed");
