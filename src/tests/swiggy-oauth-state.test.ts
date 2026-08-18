import assert from "assert/strict";
import {
  genOAuthState,
  oauthStateRedisKey,
} from "../modules/dineout/oauth-state.store";

// State is random/url-safe and distinct.
(() => {
  const a = genOAuthState();
  const b = genOAuthState();
  assert.ok(/^[A-Za-z0-9_-]+$/.test(a), "url-safe state");
  assert.ok(a.length >= 32, "enough entropy");
  assert.notEqual(a, b);
})();

// Redis key is namespaced.
(() => {
  assert.equal(oauthStateRedisKey("abc"), "swiggy:oauth:state:abc");
})();

console.log("swiggy-oauth-state.test.ts passed");

// Importing the store pulls in redisClient, which holds an open connection;
// exit explicitly so this standalone assert test doesn't hang on it.
process.exit(0);
