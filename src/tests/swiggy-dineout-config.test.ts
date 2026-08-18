import assert from "assert/strict";
import { computeSwiggyDineoutReady } from "../modules/dineout/config";

// Pure predicate so we can test the gating without mutating global EnvVars.

// Flag off => not ready regardless of secrets.
(() => {
  assert.equal(
    computeSwiggyDineoutReady({
      enabled: "false",
      clientId: "c",
      redirectUri: "https://x",
      tokenKey: "a".repeat(64),
    }),
    false
  );
})();

// Flag on but missing a secret => not ready.
(() => {
  assert.equal(
    computeSwiggyDineoutReady({
      enabled: "true",
      clientId: undefined,
      redirectUri: "https://x",
      tokenKey: "a".repeat(64),
    }),
    false
  );
  assert.equal(
    computeSwiggyDineoutReady({
      enabled: "true",
      clientId: "c",
      redirectUri: undefined,
      tokenKey: "a".repeat(64),
    }),
    false
  );
  assert.equal(
    computeSwiggyDineoutReady({
      enabled: "true",
      clientId: "c",
      redirectUri: "https://x",
      tokenKey: undefined,
    }),
    false
  );
})();

// Flag on + all secrets => ready.
(() => {
  assert.equal(
    computeSwiggyDineoutReady({
      enabled: "true",
      clientId: "c",
      redirectUri: "https://x",
      tokenKey: "a".repeat(64),
    }),
    true
  );
})();

console.log("swiggy-dineout-config.test.ts passed");
