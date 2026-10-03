"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cartKey = exports.extraLockKey = exports.ticketLockKey = exports.RedisKeys = exports.redisClient = void 0;
const ioredis_1 = require("ioredis");
const logger_1 = require("../log/logger");
const environment_1 = require("./environment");
const redisClient = new ioredis_1.Redis({
    host: environment_1.EnvVars.values.REDIS_HOST,
    port: parseInt(environment_1.EnvVars.values.REDIS_PORT) ?? 6379,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...(environment_1.EnvVars.values.REDIS_TLS === "true" && { tls: {} }),
});
exports.redisClient = redisClient;
redisClient.on("error", (err) => logger_1.logger.error("Redis Client Error", err));
redisClient.on("connect", () => logger_1.logger.info("Redis Connected"));
/**
 * Atomic ticket-inventory reservation.
 *
 * For each (key, capacityRemaining, delta) triple, increment the key by
 * delta if (current + delta) is within capacityRemaining. If any key in
 * the batch would over-sell, every prior increment in this run is rolled
 * back and the script returns [0, offendingKey]. Returns [1, ""] on
 * success and refreshes TTL on each key.
 *
 * `delta` can be negative for releasing reserved quantity.
 *
 * Invariants (do not change without rereading this block):
 *  1. Rollback uses `DECRBY(key, applied[j][2])` with the stored delta.
 *     Redis DECRBY accepts a signed integer; DECRBY by -N == INCRBY by +N.
 *     So a rollback after INCRBY(+5) decrements by 5, and a rollback
 *     after INCRBY(-5) increments by 5. Symmetric for both directions.
 *  2. Any INCRBY that produces newVal <= 0 immediately `DEL`s the key.
 *     This covers both (a) a positive delta from a missing key landing
 *     at 0 (no-op, key stays absent) and (b) a negative delta overshoot
 *     into negatives (key gets removed, future GETs return 0).
 *  3. EXPIRE is only set on keys with strictly positive newVal — never
 *     resurrect a key we just deleted.
 *  4. Redis EVAL is atomic. A client-side throw means either no state
 *     changed or all state changed; partial application is impossible.
 *     TTL covers the lost-ack case.
 */
const RESERVE_INVENTORY_SCRIPT = `
local n = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local applied = {}
for i = 1, n do
  local key = KEYS[i]
  local remaining = tonumber(ARGV[2 + (i - 1) * 2 + 1])
  local delta = tonumber(ARGV[2 + (i - 1) * 2 + 2])
  local current = tonumber(redis.call('GET', key) or '0')
  if delta > 0 and (current + delta) > remaining then
    for j = 1, #applied do
      local restored = redis.call('DECRBY', applied[j][1], applied[j][2])
      if restored <= 0 then
        redis.call('DEL', applied[j][1])
      elseif ttl > 0 then
        redis.call('EXPIRE', applied[j][1], ttl)
      end
    end
    return {0, key}
  end
  local newVal = redis.call('INCRBY', key, delta)
  applied[#applied + 1] = {key, delta}
  if newVal <= 0 then
    redis.call('DEL', key)
  elseif ttl > 0 then
    redis.call('EXPIRE', key, ttl)
  end
end
return {1, ''}
`;
redisClient.defineCommand("reserveInventory", {
    lua: RESERVE_INVENTORY_SCRIPT,
});
/**
 * Atomic increment-with-TTL for rate limiting. Replaces the prior
 * INCR + EXPIRE sequence which had a tiny window between the two ops
 * where a crash could leave a key without a TTL (so it would live
 * forever and lock the user out for good). One Lua call = atomic.
 *
 * Args: ARGV[1] = window (seconds), ARGV[2] = lockoutBase (seconds),
 *       ARGV[3] = maxAttempts.
 * Returns: the new attempt count (number).
 */
const RATE_LIMIT_INCR_SCRIPT = `
local key = KEYS[1]
local window = tonumber(ARGV[1])
local lockoutBase = tonumber(ARGV[2])
local maxAttempts = tonumber(ARGV[3])
local n = redis.call('INCR', key)
if n == 1 then
  redis.call('EXPIRE', key, window)
elseif n > maxAttempts then
  local extra = n - maxAttempts
  local backoff = lockoutBase * (2 ^ extra)
  redis.call('EXPIRE', key, backoff)
end
return n
`;
redisClient.defineCommand("rateLimitIncr", {
    lua: RATE_LIMIT_INCR_SCRIPT,
    numberOfKeys: 1,
});
/**
 * Plain FIXED-WINDOW increment for throughput / budget caps (per-IP,
 * per-event, global budgets). Unlike `rateLimitIncr` this applies NO
 * exponential backoff — the TTL is always just `window`, so the counter
 * always resets at the window boundary. Backoff is only safe for small-N
 * brute-force caps (OTP-per-phone, max 5); on a high-volume cap it would set
 * an astronomically large TTL (2^(n-max)·base) and permanently brick the key.
 *
 * Args: ARGV[1] = window (seconds). Returns the new count.
 */
const FIXED_WINDOW_INCR_SCRIPT = `
local key = KEYS[1]
local window = tonumber(ARGV[1])
local n = redis.call('INCR', key)
if n == 1 then
  redis.call('EXPIRE', key, window)
end
return n
`;
redisClient.defineCommand("fixedWindowIncr", {
    lua: FIXED_WINDOW_INCR_SCRIPT,
    numberOfKeys: 1,
});
class RedisKeys {
}
exports.RedisKeys = RedisKeys;
RedisKeys.TICKET_LOCK_PREFIX = "ticket_lock";
RedisKeys.CART_PREFIX = "customer_cart";
RedisKeys.REFRESH_TOKEN_PREFIX = "customerRefreshToken";
RedisKeys.CART_TTL_SECONDS = 13 * 60;
RedisKeys.LOCK_TTL_SECONDS = 13 * 60;
const ticketLockKey = (eventId, ticketId) => `${RedisKeys.TICKET_LOCK_PREFIX}:${eventId}:${ticketId}`;
exports.ticketLockKey = ticketLockKey;
const extraLockKey = (eventId, extraId) => `${RedisKeys.TICKET_LOCK_PREFIX}:${eventId}:extra:${extraId}`;
exports.extraLockKey = extraLockKey;
const cartKey = (customerId, eventId) => `${RedisKeys.CART_PREFIX}:${customerId}:${eventId}`;
exports.cartKey = cartKey;
