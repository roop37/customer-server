import { redisClient } from "./redis";

/**
 * Per-key sliding-window rate limiter backed by Redis. Mirrors the
 * shape of `main-server/src/utils/rateLimit.ts` so the OTP flows behave
 * identically for customers + hosts.
 *
 * Usage pattern:
 *   if (!(await checkRateLimit(`customer_otp:${phone}`))) {
 *     throw new ErrorWithProps("Too many requests, please try again later");
 *   }
 *   // ...do the work...
 *   await incrementRateLimit(`customer_otp:${phone}`);
 */

const MAX_ATTEMPTS = 5; // attempts allowed in the window
const LOCKOUT_DURATION = 15 * 60; // seconds — exponential backoff base
const WINDOW_DURATION = 60 * 60; // 1-hour rolling window
const RL_PREFIX = "rate_limit";

export const checkRateLimit = async (rlKey: string): Promise<boolean> => {
  try {
    const key = `${RL_PREFIX}:${rlKey}`;
    const attempts = await redisClient.get(key);
    if (attempts && parseInt(attempts, 10) >= MAX_ATTEMPTS) {
      return false;
    }
    return true;
  } catch (error) {
    // Fail closed — if Redis is down, refuse rather than accept abuse.
    console.error("rateLimit:check failed", error);
    return false;
  }
};

export const incrementRateLimit = async (rlKey: string): Promise<void> => {
  try {
    const key = `${RL_PREFIX}:${rlKey}`;
    // Atomic INCR + (EXPIRE on first attempt, exponential lockout
    // beyond MAX_ATTEMPTS). See utils/redis.ts for the Lua. The prior
    // non-atomic sequence could leave a key without TTL on crash.
    await (redisClient as any).rateLimitIncr(
      key,
      WINDOW_DURATION,
      LOCKOUT_DURATION,
      MAX_ATTEMPTS
    );
  } catch (error) {
    console.error("rateLimit:increment failed", error);
  }
};

export const resetRateLimit = async (rlKey: string): Promise<void> => {
  try {
    await redisClient.del(`${RL_PREFIX}:${rlKey}`);
  } catch (error) {
    console.error("rateLimit:reset failed", error);
  }
};
