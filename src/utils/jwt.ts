import crypto from "crypto";
import jwt from "jsonwebtoken";
import { CustomerModel } from "../modules/customer/schema/customer.schema";
import { ScannerUserModel } from "../modules/scanner/schema/scanner-user.schema";
import { EnvVars } from "./environment";
import { redisClient } from "./redis";
import { isAlphanumeric } from "./validations";

// Store only a SHA-256 hash of the refresh token in Redis. A Redis dump
// then exposes only the hashes; an attacker can't replay a captured
// session because hash(submitted) won't match the stored value unless
// they also have the JWT itself (which is already protected by signature
// + DB-tied authTokenVersion).
const hashToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

export interface JwtCustomerPayload {
  customer: string;
  version: number;
  uniqueId: string;
}

export interface JwtScannerPayload {
  scanner: string;
  eventId: string;
  businessId: string;
  version: number;
}

const PUBLIC_KEY = Buffer.from(EnvVars.values.PUBLIC_KEY || "", "base64").toString("ascii");
const PRIVATE_KEY = Buffer.from(EnvVars.values.PRIVATE_KEY || "", "base64").toString("ascii");

const ACCESS_TOKEN_EXPIRY = "10h";
// Bumped from 30d to 90d on 2026-05-19 — customer auth overhaul moved
// to Google/Apple OAuth + phone OTP. Long-lived refresh keeps repeat
// purchasers signed in across booking cycles. Tied to Redis storage TTL
// below; keep both in sync.
const REFRESH_TOKEN_EXPIRY = "90d";
const REFRESH_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;

export const createCustomerAuthTokens = (
  payload: JwtCustomerPayload
): { accessToken: string; refreshToken: string } => {
  const accessToken = jwt.sign(payload, PRIVATE_KEY, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
    algorithm: "RS256",
  });

  const refreshToken = jwt.sign(payload, PRIVATE_KEY, {
    expiresIn: REFRESH_TOKEN_EXPIRY,
    algorithm: "RS256",
  });

  return { accessToken, refreshToken };
};

export const verifyCustomerAccessToken = async (
  aToken: string
): Promise<{ _id: string; phone: string } | null> => {
  try {
    const payload = jwt.verify(aToken, PUBLIC_KEY, {
      algorithms: ["RS256"],
    }) as jwt.JwtPayload & JwtCustomerPayload;

    if (!isAlphanumeric(payload.customer)) return null;

    const customer = await CustomerModel.findById(payload.customer)
      .select("_id phone authTokenVersion")
      .lean();

    if (!customer || customer.authTokenVersion !== payload.version) return null;

    return { _id: customer._id.toString(), phone: customer.phone };
  } catch (err) {
    return null;
  }
};

export const refreshCustomerAuthTokens = async (
  rToken: string
): Promise<{
  customer: string;
  aToken: string;
  rToken: string;
  uniqueId: string;
} | null> => {
  try {
    const payload = jwt.verify(rToken, PUBLIC_KEY, {
      algorithms: ["RS256"],
    }) as jwt.JwtPayload & JwtCustomerPayload;

    if (!isAlphanumeric(payload.customer)) return null;

    const customer = await CustomerModel.findById(payload.customer)
      .select("_id authTokenVersion")
      .lean();

    if (!customer || customer.authTokenVersion !== payload.version) return null;

    const storedHash = await redisClient.get(
      `customerRefreshToken:${customer._id}:${payload.uniqueId}`
    );
    if (!storedHash || storedHash !== hashToken(rToken)) return null;

    const { accessToken, refreshToken } = createCustomerAuthTokens({
      customer: payload.customer,
      version: payload.version,
      uniqueId: payload.uniqueId,
    });

    return {
      customer: customer._id.toString(),
      aToken: accessToken,
      rToken: refreshToken,
      uniqueId: payload.uniqueId,
    };
  } catch {
    return null;
  }
};

export const storeCustomerRefreshToken = async (
  customerId: string,
  uniqueId: string,
  refreshToken: string
) => {
  const key = `customerRefreshToken:${customerId}:${uniqueId}`;
  await redisClient.setex(
    key,
    REFRESH_TOKEN_TTL_SECONDS,
    hashToken(refreshToken)
  );
};

export const revokeCustomerRefreshToken = async (
  customerId: string,
  uniqueId: string
) => {
  await redisClient.del(`customerRefreshToken:${customerId}:${uniqueId}`);
};

// --- Scanner tokens ---

const SCANNER_ACCESS_TOKEN_EXPIRY = "12h";
const SCANNER_REFRESH_TOKEN_EXPIRY = "7d";
const SCANNER_REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export const createScannerAuthTokens = (
  payload: JwtScannerPayload
): { accessToken: string; refreshToken: string } => ({
  accessToken: jwt.sign(payload, PRIVATE_KEY, {
    expiresIn: SCANNER_ACCESS_TOKEN_EXPIRY,
    algorithm: "RS256",
  }),
  refreshToken: jwt.sign(payload, PRIVATE_KEY, {
    expiresIn: SCANNER_REFRESH_TOKEN_EXPIRY,
    algorithm: "RS256",
  }),
});

// Per-scanner Redis allowlist. Mirrors the customer pattern: store
// only the sha256 hash of the latest refresh token, so a leaked Redis
// dump can't be replayed. A scanner only has ONE active refresh at a
// time — the most recent login or refresh wins.
const scannerRefreshKey = (scannerId: string) =>
  `scannerRefreshToken:${scannerId}`;

export const storeScannerRefreshToken = async (
  scannerId: string,
  refreshToken: string
): Promise<void> => {
  await redisClient.setex(
    scannerRefreshKey(scannerId),
    SCANNER_REFRESH_TOKEN_TTL_SECONDS,
    hashToken(refreshToken)
  );
};

export const revokeScannerRefreshToken = async (
  scannerId: string
): Promise<void> => {
  await redisClient.del(scannerRefreshKey(scannerId));
};

export const verifyScannerAccessToken = async (
  token: string
): Promise<JwtScannerPayload | null> => {
  try {
    const payload = jwt.verify(token, PUBLIC_KEY, {
      algorithms: ["RS256"],
    }) as jwt.JwtPayload & JwtScannerPayload;

    if (!payload?.scanner || !isAlphanumeric(payload.scanner)) return null;

    const scanner = await ScannerUserModel.findOne({
      _id: payload.scanner,
      isDeleted: false,
      isActive: true,
    })
      .select("_id authTokenVersion eventId businessId")
      .lean();

    if (!scanner) return null;
    if (scanner.authTokenVersion !== payload.version) return null;
    if (scanner.eventId !== payload.eventId) return null;

    return payload;
  } catch {
    return null;
  }
};

/**
 * Verify a scanner *refresh* token and mint a fresh access+refresh pair.
 * Refresh tokens are signed with the same key + the same payload shape
 * as the access token, so we reuse `verifyScannerAccessToken` to check
 * the JWT signature + DB-tied version. Returns `null` if the refresh
 * token is expired / revoked / unknown — callers must respond 401.
 *
 * Rotating the refresh token on every refresh isn't strictly required
 * for scanners (they're on a long-lived device session, not a browser),
 * but we mint a fresh pair so a single stolen refresh token doesn't
 * give an attacker the full 7d window — they'd need to keep stealing.
 */
export const refreshScannerAuthTokens = async (
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string } | null> => {
  const payload = await verifyScannerAccessToken(refreshToken);
  if (!payload) return null;

  // Allowlist check — only the most recently issued refresh token for
  // this scanner is valid. A stolen older refresh token (e.g. captured
  // before a legitimate refresh rotated it out) fails here even though
  // the JWT signature + authTokenVersion would otherwise let it pass.
  const storedHash = await redisClient.get(scannerRefreshKey(payload.scanner));
  if (!storedHash || storedHash !== hashToken(refreshToken)) {
    return null;
  }
  const pair = createScannerAuthTokens({
    scanner: payload.scanner,
    eventId: payload.eventId,
    businessId: payload.businessId,
    version: payload.version,
  });
  // Rotate the allowlist: the old token's hash is overwritten by the
  // new one's. The same token presented again will fail the storedHash
  // check above.
  await storeScannerRefreshToken(payload.scanner, pair.refreshToken);
  return pair;
};

