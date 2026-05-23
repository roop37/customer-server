"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("assert/strict"));
const inventory_math_1 = require("../modules/cart/service/inventory-math");
// --- Regression: increase near sell-out must not be rejected when
// total headroom still permits it.
// Setup: capacity 100, sold 0, others locked 70, this customer locked 5.
// Customer wants 8 (delta +3). Lua's check `current + delta > remaining`
// will be: 75 + 3 = 78. remaining must be >= 78 for the lock to succeed.
(() => {
    const remaining = (0, inventory_math_1.computeLockRemaining)({
        capacity: 100,
        sold: 0,
        currentLocked: 75, // 70 others + 5 mine
        pendingOrderQty: 0,
    });
    strict_1.default.equal(remaining, 100, "near-soldout valid increase must be allowed (remaining should be 100)");
    strict_1.default.ok(75 + 3 <= remaining, "lua check must accept 75+3 against the returned remaining");
})();
// --- Hard sell-out: capacity 100 sold 95, no pending. A new customer
// trying for qty=10 must be rejected (10 > 5 headroom).
(() => {
    const remaining = (0, inventory_math_1.computeLockRemaining)({
        capacity: 100,
        sold: 95,
        currentLocked: 0,
        pendingOrderQty: 0,
    });
    strict_1.default.equal(remaining, 5, "hard sell-out reflects remaining capacity");
    strict_1.default.ok(0 + 10 > remaining, "lua must reject over-sell");
    strict_1.default.ok(0 + 5 <= remaining, "lua must allow exact-fill");
})();
// --- Pending-orders-without-redis-lock: cart locks expired but orders
// still pending. Those pending orders must still occupy the pool.
(() => {
    const remaining = (0, inventory_math_1.computeLockRemaining)({
        capacity: 100,
        sold: 0,
        currentLocked: 5, // only mine left in redis
        pendingOrderQty: 60, // 60 paid-pending orders out there
    });
    // pendingNotInRedis = max(0, 60 - 5) = 55
    // remaining = 100 - 0 - 55 = 45
    strict_1.default.equal(remaining, 45, "pending orders without active redis lock are subtracted");
})();
// --- Sold + pending + locked stack correctly.
(() => {
    const remaining = (0, inventory_math_1.computeLockRemaining)({
        capacity: 200,
        sold: 50,
        currentLocked: 70, // 70 actively locked carts (covers all pending below)
        pendingOrderQty: 30,
    });
    // pendingNotInRedis = max(0, 30 - 70) = 0
    // remaining = 200 - 50 - 0 = 150
    strict_1.default.equal(remaining, 150, "fully locked-covered pending doesn't double-count");
})();
// --- Capacity = 0 / sold > capacity edge: remaining clamps at 0.
(() => {
    const remaining = (0, inventory_math_1.computeLockRemaining)({
        capacity: 100,
        sold: 105, // over-sold (shouldn't happen but guard anyway)
        currentLocked: 0,
        pendingOrderQty: 0,
    });
    strict_1.default.equal(remaining, 0, "over-sold floor at 0");
})();
// --- Original Lua call shape verification: with the broken old code, a
// customer wanting to increase from 5 → 8 (delta +3) when others have
// locked 70 of 100 would have computed remaining=30 and rejected. The new
// remaining is 100, so the Lua check `current(75) + delta(3) = 78 <= 100`
// passes — the explicit assertion the regression existed for.
(() => {
    const remaining = (0, inventory_math_1.computeLockRemaining)({
        capacity: 100,
        sold: 0,
        currentLocked: 75,
        pendingOrderQty: 0,
    });
    const luaCurrent = 75;
    const delta = 3;
    strict_1.default.ok(luaCurrent + delta <= remaining, "regression: valid increase near sell-out must NOT be rejected by Lua check");
})();
// eslint-disable-next-line no-console
console.log("cart inventory math tests passed");
