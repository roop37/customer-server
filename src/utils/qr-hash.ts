import crypto from "crypto";
import { EnvVars } from "./environment";

/**
 * AUDIT-023: versioned HMAC signing for ticket QR codes.
 *
 * The QR payload (`hoizr:<orderId>:<paymentId>`) is HMAC-signed and the
 * hash stored on the Order. Before this registry the key was the static
 * ENCRYPTION_KEY with no key-id, so rotating it would have invalidated
 * every live ticket at once. Now each order records `qrHashVersion`;
 * verification picks the key the ticket was SIGNED with, so a rotation
 * window can serve old (v1) and new (v2) tickets simultaneously.
 *
 * Rotation procedure: add `2: EnvVars.values.ENCRYPTION_KEY_V2` here
 * (and the env var), bump CURRENT_QR_HASH_VERSION to 2, and mirror the
 * same two-line change in hoizr-workers' razorpay-webhook QR helper —
 * both services sign; only customer-server verifies.
 */
export const CURRENT_QR_HASH_VERSION = 1;

const qrKeyForVersion = (version: number): string => {
  switch (version) {
    case 1:
      return EnvVars.values.ENCRYPTION_KEY;
    default:
      // Unknown version — return an empty key so verification fails
      // closed (an attacker can't force a fallback to a guessable key).
      return "";
  }
};

export const signQrPayload = (
  payload: string
): { hash: string; version: number } => ({
  hash: crypto
    .createHmac("sha256", qrKeyForVersion(CURRENT_QR_HASH_VERSION))
    .update(payload)
    .digest("hex"),
  version: CURRENT_QR_HASH_VERSION,
});

export const verifyQrHashVersioned = (
  payload: string,
  storedHash: string,
  version?: number | null
): boolean => {
  const key = qrKeyForVersion(version ?? 1);
  if (!key) return false;
  const expected = crypto
    .createHmac("sha256", key)
    .update(payload)
    .digest("hex");
  if (expected.length !== storedHash.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(storedHash, "hex")
  );
};
