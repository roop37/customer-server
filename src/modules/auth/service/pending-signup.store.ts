import crypto from "crypto";
import { nanoid } from "nanoid";
import { redisClient } from "../../../utils/redis";
import type { GoogleProfile } from "./oauth-verifier";

const KEY_PREFIX = "customerPendingSignup:";
const TTL_SECONDS = 600; // 10 minutes — enough to enter phone + OTP

export type PendingSignupProvider = "google" | "apple";

export type PendingSignupEntry = {
  provider: PendingSignupProvider;
  google?: GoogleProfile;
  // Apple slot lives here when Apple Sign In is later enabled.
  apple?: { id: string; email?: string; name?: string };
  phone?: string;
  otpId?: string;
  createdAt: number;
};

// Pending tokens are stored under a sha256 hash of the raw token so a
// Redis dump can't be replayed against the OAuth signup flow. The raw
// token is returned to the client exactly once (at create time).
const hashToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

const keyFor = (token: string) => `${KEY_PREFIX}${hashToken(token)}`;

export const createPendingSignup = async (
  entry: Omit<PendingSignupEntry, "createdAt">
): Promise<string> => {
  const token = nanoid(32);
  const payload: PendingSignupEntry = { ...entry, createdAt: Date.now() };
  await redisClient.setex(keyFor(token), TTL_SECONDS, JSON.stringify(payload));
  return token;
};

export const readPendingSignup = async (
  token: string
): Promise<PendingSignupEntry | null> => {
  if (!token) return null;
  const raw = await redisClient.get(keyFor(token));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingSignupEntry;
  } catch {
    return null;
  }
};

export const updatePendingSignup = async (
  token: string,
  patch: Partial<PendingSignupEntry>
): Promise<PendingSignupEntry | null> => {
  const current = await readPendingSignup(token);
  if (!current) return null;
  const next = { ...current, ...patch };
  // Preserve the original TTL window — extending it on every update
  // would let a stuck pending entry live forever. If the key has
  // already expired between read and write (`ttl()` returns -2) or
  // has no TTL set (`-1`), fall back to the canonical TTL_SECONDS so
  // `setex` never receives a non-positive duration (which is undefined
  // behavior across Redis versions).
  const remaining = await redisClient.ttl(keyFor(token));
  const safeTtl = remaining > 0 ? remaining : TTL_SECONDS;
  await redisClient.setex(keyFor(token), safeTtl, JSON.stringify(next));
  return next;
};

export const deletePendingSignup = async (token: string): Promise<void> => {
  if (!token) return;
  await redisClient.del(keyFor(token));
};
