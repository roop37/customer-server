import { isValidE164, toE164 } from "@hoizr-technology/shared";

export const isAlphanumeric = (value: string): boolean => {
  return /^[a-zA-Z0-9]+$/.test(value);
};

/**
 * Loose phone validator kept for backwards-compat with call-sites that
 * just need to reject obviously-broken input. New code should normalise
 * via `normalizeCustomerPhone` instead — that returns the E.164 form so
 * downstream lookups + storage are consistent.
 */
export const isValidPhone = (phone: string): boolean => {
  return /^\+?[1-9]\d{7,14}$/.test(phone);
};

/**
 * Normalise a customer-supplied phone to E.164.
 *
 * Returns `{ raw, e164 }`:
 *   - `raw` is the trimmed input (used for dual-lookup against legacy
 *     records whose `phone` field hasn't been backfilled yet)
 *   - `e164` is the E.164 form (the canonical write target post-D16)
 *
 * Throws `null` for unrecoverable inputs — caller should map that to a
 * "invalid phone number" 4xx.
 */
export const normalizeCustomerPhone = (
  phone: string
): { raw: string; e164: string } | null => {
  if (typeof phone !== "string") return null;
  const raw = phone.trim();
  if (!raw) return null;

  const e164 = toE164(raw, "IN");
  if (!e164 || !isValidE164(e164)) return null;

  return { raw, e164 };
};

export const isValidEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};
