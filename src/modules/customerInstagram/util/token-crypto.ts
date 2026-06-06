import crypto from "crypto";
import { EnvVars } from "../../../utils/environment";

/**
 * Tiny AES-256-GCM helper for the long-lived Instagram access token
 * we persist alongside the connection record. Format on disk:
 *
 *   v1:<base64(iv)>:<base64(authTag)>:<base64(ciphertext)>
 *
 * The version prefix gives us a no-downtime rotation path: bump to v2
 * later, write v2 records, and the decrypt branch on `v1` keeps reading
 * the historical rows. Without the prefix, rotating the key would mean
 * a one-shot migration script.
 *
 * The key comes from META_INSTAGRAM_TOKEN_KEY (a 64-char hex string =
 * 32 raw bytes for AES-256). When the env var is unset (stub mode) the
 * helpers throw; callers should branch on `isCryptoConfigured()` to
 * avoid getting here at all in stub mode.
 */

const VERSION = "v1";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit IV is the AES-GCM standard

const readKey = (): Buffer => {
  const hex = EnvVars.values.META_INSTAGRAM_TOKEN_KEY ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      "META_INSTAGRAM_TOKEN_KEY must be a 64-hex-character string (32 bytes). Generate with `openssl rand -hex 32`."
    );
  }
  return Buffer.from(hex, "hex");
};

export const isCryptoConfigured = (): boolean => {
  const hex = EnvVars.values.META_INSTAGRAM_TOKEN_KEY;
  return Boolean(hex && /^[0-9a-fA-F]{64}$/.test(hex));
};

export const encryptToken = (plaintext: string): string => {
  const key = readKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
};

export const decryptToken = (envelope: string): string => {
  const parts = envelope.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Encrypted token envelope is malformed or unknown version");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const key = readKey();
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(ctB64, "base64");
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
};

/**
 * HMAC-SHA256 signer for the OAuth `state` round-trip. We embed the
 * customerId + a nonce + a timestamp in the state, sign it, and reject
 * anything older than 10 minutes on the callback. Prevents an attacker
 * from forging a callback that links their IG to someone else's
 * Hoizr account.
 */
const STATE_TTL_MS = 10 * 60 * 1000;

type StatePayload = {
  customerId: string;
  nonce: string;
  ts: number;
};

const readStateSecret = (): string => {
  const secret = EnvVars.values.META_INSTAGRAM_STATE_SECRET;
  if (!secret) {
    throw new Error(
      "META_INSTAGRAM_STATE_SECRET is required to sign the OAuth state blob."
    );
  }
  return secret;
};

export const signState = (customerId: string): string => {
  const payload: StatePayload = {
    customerId,
    nonce: crypto.randomBytes(8).toString("hex"),
    ts: Date.now(),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = crypto
    .createHmac("sha256", readStateSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${mac}`;
};

export const verifyState = (state: string): StatePayload => {
  const parts = state.split(".");
  if (parts.length !== 2) {
    throw new Error("OAuth state is malformed");
  }
  const [body, mac] = parts;
  const expected = crypto
    .createHmac("sha256", readStateSecret())
    .update(body)
    .digest("base64url");
  // timingSafeEqual requires equal-length buffers — if the lengths
  // already differ, the state is forged.
  if (
    mac.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
  ) {
    throw new Error("OAuth state signature is invalid");
  }
  const payload = JSON.parse(
    Buffer.from(body, "base64url").toString("utf8")
  ) as StatePayload;
  if (!payload.customerId || typeof payload.ts !== "number") {
    throw new Error("OAuth state payload is invalid");
  }
  if (Date.now() - payload.ts > STATE_TTL_MS) {
    throw new Error("OAuth state has expired — please retry");
  }
  return payload;
};
