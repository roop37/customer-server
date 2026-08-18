import assert from "assert/strict";
import crypto from "crypto";
import { deriveChallenge, generatePkcePair } from "../modules/dineout/util/pkce";

// Challenge is the base64url SHA-256 of the verifier (RFC 7636 S256).
(() => {
  const verifier = "abc123_-VERIFIER";
  const expected = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  assert.equal(deriveChallenge(verifier), expected);
})();

// Generated pair is internally consistent and URL-safe.
(() => {
  const { codeVerifier, codeChallenge } = generatePkcePair();
  assert.ok(/^[A-Za-z0-9_-]+$/.test(codeVerifier), "verifier is base64url");
  assert.ok(codeVerifier.length >= 43, "verifier >= 43 chars (RFC 7636)");
  assert.equal(
    deriveChallenge(codeVerifier),
    codeChallenge,
    "challenge matches verifier"
  );
})();

// Two pairs differ.
(() => {
  assert.notEqual(
    generatePkcePair().codeVerifier,
    generatePkcePair().codeVerifier
  );
})();

console.log("swiggy-pkce.test.ts passed");
