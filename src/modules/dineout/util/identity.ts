import crypto from "crypto";

/**
 * Store the Swiggy user id only as a SHA-256 hash (compliance: hash
 * identifiers at rest, never persist plaintext PII). The plaintext id comes
 * from the `user_id` claim inside the Swiggy access-token JWT.
 */
export const hashSwiggyUserId = (id: string): string =>
  crypto.createHash("sha256").update(id).digest("hex");
