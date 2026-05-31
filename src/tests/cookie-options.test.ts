import assert from "assert/strict";
import { buildCustomerCookieOptions } from "../utils/cookie";

(() => {
  const options = buildCustomerCookieOptions(".hoizr.com", false);

  assert.equal(options.domain, ".hoizr.com");
  assert.equal(options.sameSite, "none");
  assert.equal(options.secure, true);
  assert.equal(options.httpOnly, true);
  assert.equal(options.path, "/");
})();

(() => {
  const options = buildCustomerCookieOptions(undefined, false);

  assert.equal("domain" in options, false);
  assert.equal(options.sameSite, "lax");
  assert.equal("secure" in options, false);
  assert.equal(options.httpOnly, true);
  assert.equal(options.path, "/");
})();

console.log("customer cookie-options.test.ts passed");
