/**
 * Pure functions for the cart inventory lock math. Isolated from
 * cart.service so unit tests don't pull in Redis / Mongo at module load.
 */

export type LockRemainingInput = {
  capacity: number;
  sold: number;
  currentLocked: number;
  pendingOrderQty: number;
};

/**
 * Absolute upper bound for the Redis lock counter on a single ticket /
 * extra SKU. Passed to the reserveInventory Lua script as `remaining`.
 *
 * The Lua reads the counter via `GET(key)` — that's the total of every
 * customer's lock on this SKU. The check is `current + delta > remaining`.
 * Therefore `remaining` MUST be a system-wide bound, not a per-customer
 * value. Sending a per-customer figure was the bug that rejected valid
 * increases near sell-out (others' locks got subtracted twice).
 *
 * Bound: `capacity - sold - pendingNotInRedis`, where
 * `pendingNotInRedis = max(0, pendingOrderQty - currentLocked)`. The
 * second term covers the edge case where a pending DB order's Redis
 * lock has expired but the order is still pending — those tickets are
 * still committed to that order and shouldn't be re-sold.
 */
export const computeLockRemaining = (params: LockRemainingInput): number => {
  const { capacity, sold, currentLocked, pendingOrderQty } = params;
  const pendingNotInRedis = Math.max(0, pendingOrderQty - currentLocked);
  return Math.max(0, capacity - sold - pendingNotInRedis);
};
