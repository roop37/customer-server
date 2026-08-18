import crypto from "crypto";
import { redisClient } from "../../utils/redis";

/**
 * Short-lived store for the PKCE `code_verifier` + owning `customerId`,
 * keyed by the opaque OAuth `state` (CSRF token). The verifier never leaves
 * the server; only the challenge goes in the authorize URL. Single-use:
 * the callback consumes (reads then deletes) the entry so a replayed
 * callback can't reuse it.
 */
const STATE_TTL_SECONDS = 10 * 60;

export const oauthStateRedisKey = (state: string): string =>
  `swiggy:oauth:state:${state}`;

export const genOAuthState = (): string =>
  crypto.randomBytes(32).toString("base64url");

export type OAuthStateEntry = { customerId: string; codeVerifier: string };

export const saveOAuthState = async (
  state: string,
  entry: OAuthStateEntry
): Promise<void> => {
  await redisClient.set(
    oauthStateRedisKey(state),
    JSON.stringify(entry),
    "EX",
    STATE_TTL_SECONDS
  );
};

/**
 * Single-use: atomically read-and-delete (Redis GETDEL, 6.2+) so even two
 * concurrent replays of the same state can't both obtain the entry — only
 * one caller gets the value, the rest get null.
 */
export const consumeOAuthState = async (
  state: string
): Promise<OAuthStateEntry | null> => {
  const raw = await redisClient.getdel(oauthStateRedisKey(state));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OAuthStateEntry;
  } catch {
    return null;
  }
};
