import { signQrPayload } from "./qr-hash";

/**
 * Golden-ticket QR for a guestlist entry. Uses the SAME versioned HMAC as
 * order tickets (utils/qr-hash) so the scanner verifies both with one key
 * registry. A distinct `hoizr-gl:` prefix keeps it from colliding with the
 * order QR format (`hoizr:<orderId>:<paymentId>`).
 */
export const generateGuestlistQrPayload = (
  entryId: string,
  code: string
): { payload: string; hash: string; version: number } => {
  const payload = `hoizr-gl:${entryId}:${code}`;
  const { hash, version } = signQrPayload(payload);
  return { payload, hash, version };
};

/** Parse a guestlist QR. Returns null for anything that isn't ours. */
export const parseGuestlistQrPayload = (
  qr: string
): { entryId: string; code: string } | null => {
  if (!qr || !qr.startsWith("hoizr-gl:")) return null;
  const parts = qr.split(":");
  if (parts.length !== 3) return null;
  const [, entryId, code] = parts;
  if (!entryId || !code) return null;
  return { entryId, code };
};
