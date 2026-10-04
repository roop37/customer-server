import assert from "assert/strict";
import { makeEnforceRateLimit } from "../utils/rateLimit";

// enforceRateLimit increments an atomic counter and throws once it passes `max`.
(async () => {
  const counts: Record<string, number> = {};
  const fakeRedis = {
    fixedWindowIncr: async (key: string) =>
      (counts[key] = (counts[key] ?? 0) + 1),
  };
  const enforce = makeEnforceRateLimit(fakeRedis);

  await enforce("k", 2, 60); // count 1 → ok
  await enforce("k", 2, 60); // count 2 → ok (== max)

  let threw = false;
  try {
    await enforce("k", 2, 60); // count 3 → over max → throw
  } catch {
    threw = true;
  }
  assert.equal(threw, true, "should throw once count exceeds max");

  // A different key has an independent bucket.
  await enforce("other", 2, 60);
  assert.equal(counts["rate_limit:other"], 1);

  console.log("rate-limit-enforce.test.ts passed");
  process.exit(0);
})();
