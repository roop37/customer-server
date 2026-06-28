import * as cloudinary from "cloudinary";
import { ErrorWithProps } from "mercurius";
import { EnvVars } from "./environment";

let configured = false;
const ensureConfigured = (): void => {
  if (configured) return;
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } =
    EnvVars.values;
  if (
    !CLOUDINARY_CLOUD_NAME ||
    !CLOUDINARY_API_KEY ||
    !CLOUDINARY_API_SECRET
  ) {
    throw new ErrorWithProps(
      "Invoice download is not configured on this server. Contact support.",
      { code: "INVOICE_NOT_CONFIGURED" }
    );
  }
  cloudinary.v2.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
  });
  configured = true;
};

/**
 * Re-issue a short-lived signed download URL for a private invoice PDF
 * stored on Cloudinary. Invoice PDFs carry customer PII + GSTIN and per
 * SoT §34a must never be served via public URLs — this helper is the
 * only sanctioned way to mint a fresh link from the customer-server.
 *
 * Default TTL is 15 minutes — long enough for the browser to fetch the
 * file (and the customer to save it locally) but short enough that a
 * leaked link from a shared chat or screenshot is rapidly stale.
 */
export const generateSignedPdfUrl = (
  publicId: string,
  ttlSeconds = 15 * 60
): { signedUrl: string; expiresAt: Date } => {
  ensureConfigured();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  const signedUrl = cloudinary.v2.utils.private_download_url(publicId, "pdf", {
    resource_type: "raw",
    expires_at: Math.floor(expiresAt.getTime() / 1000),
  });
  return { signedUrl, expiresAt };
};
