import assert from "assert/strict";

// Set the key BEFORE importing the module (EnvVars reads process.env at load).
process.env.SWIGGY_TOKEN_ENCRYPTION_KEY = "a".repeat(64); // 32 bytes hex

import {
  encryptSwiggyToken,
  decryptSwiggyToken,
} from "../modules/dineout/util/token-crypto";

// Round-trip.
(() => {
  const secret = "eyJhbGciOiJI.fake.swiggy.token";
  const envelope = encryptSwiggyToken(secret);
  assert.notEqual(envelope, secret, "ciphertext must differ from plaintext");
  assert.ok(envelope.startsWith("v1:"), "versioned envelope");
  assert.equal(decryptSwiggyToken(envelope), secret, "round-trips");
})();

// Two encryptions of the same plaintext differ (random IV).
(() => {
  const a = encryptSwiggyToken("same");
  const b = encryptSwiggyToken("same");
  assert.notEqual(a, b, "random IV => distinct ciphertexts");
})();

// Tampered ciphertext fails the auth tag.
(() => {
  const env = encryptSwiggyToken("tamper-me");
  const parts = env.split(":");
  const ct = Buffer.from(parts[3], "base64");
  ct[0] = ct[0] ^ 0xff;
  parts[3] = ct.toString("base64");
  assert.throws(() => decryptSwiggyToken(parts.join(":")), "tamper detected");
})();

// Malformed envelope throws.
(() => {
  assert.throws(() => decryptSwiggyToken("not-an-envelope"));
})();

console.log("swiggy-token-crypto.test.ts passed");
