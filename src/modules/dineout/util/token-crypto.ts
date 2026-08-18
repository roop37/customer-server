import crypto from "crypto";
import { EnvVars } from "../../../utils/environment";

/**
 * AES-256-GCM for the per-user Swiggy access token persisted in the token
 * vault. Format on disk: v1:<base64(iv)>:<base64(tag)>:<base64(ct)>.
 * Mirrors customerInstagram/util/token-crypto.ts (versioned for rotation).
 * Key: SWIGGY_TOKEN_ENCRYPTION_KEY (64 hex chars = 32 bytes). Generate with
 * `openssl rand -hex 32`.
 */
const VERSION = "v1";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit IV is the AES-GCM standard

const readKey = (): Buffer => {
  const hex = EnvVars.values.SWIGGY_TOKEN_ENCRYPTION_KEY ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      "SWIGGY_TOKEN_ENCRYPTION_KEY must be a 64-hex-character string (32 bytes). Generate with `openssl rand -hex 32`."
    );
  }
  return Buffer.from(hex, "hex");
};

// (No isConfigured predicate here: isSwiggyDineoutReady() in config.ts already
// gates on the key's presence before any crypto call can happen.)

export const encryptSwiggyToken = (plaintext: string): string => {
  const key = readKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ct.toString("base64"),
  ].join(":");
};

export const decryptSwiggyToken = (envelope: string): string => {
  const parts = envelope.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Swiggy token envelope is malformed or unknown version");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const key = readKey();
  const decipher = crypto.createDecipheriv(
    ALGO,
    key,
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]);
  return pt.toString("utf8");
};
