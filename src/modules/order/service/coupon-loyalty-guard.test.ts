/**
 * Runnable check for the loyalty-coupon personal-binding guard. No DB.
 *   npx ts-node src/modules/order/service/coupon-loyalty-guard.test.ts
 */
import assert from "assert";
import { isLoyaltyCouponUsableBy } from "./coupon-eval";

// A normal host promo (no origin) is usable by anyone, signed-in or not.
assert.strictEqual(isLoyaltyCouponUsableBy({ code: "SAVE10" }, "cust_A"), true);
assert.strictEqual(isLoyaltyCouponUsableBy({ origin: "manual" }, undefined), true);

// A loyalty coupon is usable ONLY by the customer it was bound to.
const loyal = { origin: "loyalty", boundCustomerId: "cust_A" };
assert.strictEqual(isLoyaltyCouponUsableBy(loyal, "cust_A"), true);
assert.strictEqual(isLoyaltyCouponUsableBy(loyal, "cust_B"), false);
assert.strictEqual(isLoyaltyCouponUsableBy(loyal, undefined), false); // guest can't use it

console.log("coupon-loyalty-guard: all assertions passed");
