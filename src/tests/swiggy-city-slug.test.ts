import assert from "assert/strict";
import { citySlug } from "../modules/dineout/util/city-slug";

(() => {
  assert.equal(citySlug("Bangalore"), "bangalore");
  assert.equal(citySlug("  New Delhi "), "new-delhi");
  assert.equal(citySlug("Navi Mumbai / Panvel"), "navi-mumbai-panvel");
  assert.equal(citySlug(""), "default");
  assert.equal(citySlug("   "), "default");
})();

console.log("swiggy-city-slug.test.ts passed");
