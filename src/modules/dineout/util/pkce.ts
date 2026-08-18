import crypto from "crypto";

/**
 * RFC 7636 PKCE (S256). The verifier stays server-side (Redis); only the
 * challenge is sent in the authorize URL. Swiggy is a public OAuth client
 * (no client secret) — PKCE is what protects the code exchange.
 */
export const deriveChallenge = (verifier: string): string =>
  crypto.createHash("sha256").update(verifier).digest("base64url");

export const generatePkcePair = (): {
  codeVerifier: string;
  codeChallenge: string;
} => {
  const codeVerifier = crypto.randomBytes(32).toString("base64url"); // 43 url-safe chars
  return { codeVerifier, codeChallenge: deriveChallenge(codeVerifier) };
};
