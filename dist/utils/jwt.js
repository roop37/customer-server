"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshScannerAuthTokens = exports.verifyScannerAccessToken = exports.revokeScannerRefreshToken = exports.storeScannerRefreshToken = exports.createScannerAuthTokens = exports.revokeCustomerRefreshToken = exports.storeCustomerRefreshToken = exports.refreshCustomerAuthTokens = exports.verifyCustomerAccessToken = exports.createCustomerAuthTokens = void 0;
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const customer_schema_1 = require("../modules/customer/schema/customer.schema");
const scanner_user_schema_1 = require("../modules/scanner/schema/scanner-user.schema");
const environment_1 = require("./environment");
const redis_1 = require("./redis");
const validations_1 = require("./validations");
// Store only a SHA-256 hash of the refresh token in Redis. A Redis dump
// then exposes only the hashes; an attacker can't replay a captured
// session because hash(submitted) won't match the stored value unless
// they also have the JWT itself (which is already protected by signature
// + DB-tied authTokenVersion).
const hashToken = (token) => crypto_1.default.createHash("sha256").update(token).digest("hex");
const PUBLIC_KEY = Buffer.from(environment_1.EnvVars.values.PUBLIC_KEY || "", "base64").toString("ascii");
const PRIVATE_KEY = Buffer.from(environment_1.EnvVars.values.PRIVATE_KEY || "", "base64").toString("ascii");
const ACCESS_TOKEN_EXPIRY = "10h";
// Bumped from 30d to 90d on 2026-05-19 — customer auth overhaul moved
// to Google/Apple OAuth + phone OTP. Long-lived refresh keeps repeat
// purchasers signed in across booking cycles. Tied to Redis storage TTL
// below; keep both in sync.
const REFRESH_TOKEN_EXPIRY = "90d";
const REFRESH_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;
const createCustomerAuthTokens = (payload) => {
    const accessToken = jsonwebtoken_1.default.sign(payload, PRIVATE_KEY, {
        expiresIn: ACCESS_TOKEN_EXPIRY,
        algorithm: "RS256",
    });
    const refreshToken = jsonwebtoken_1.default.sign(payload, PRIVATE_KEY, {
        expiresIn: REFRESH_TOKEN_EXPIRY,
        algorithm: "RS256",
    });
    return { accessToken, refreshToken };
};
exports.createCustomerAuthTokens = createCustomerAuthTokens;
const verifyCustomerAccessToken = async (aToken) => {
    try {
        const payload = jsonwebtoken_1.default.verify(aToken, PUBLIC_KEY, {
            algorithms: ["RS256"],
        });
        if (!(0, validations_1.isAlphanumeric)(payload.customer))
            return null;
        const customer = await customer_schema_1.CustomerModel.findById(payload.customer)
            .select("_id phone authTokenVersion")
            .lean();
        if (!customer || customer.authTokenVersion !== payload.version)
            return null;
        return { _id: customer._id.toString(), phone: customer.phone };
    }
    catch (err) {
        return null;
    }
};
exports.verifyCustomerAccessToken = verifyCustomerAccessToken;
const refreshCustomerAuthTokens = async (rToken) => {
    try {
        const payload = jsonwebtoken_1.default.verify(rToken, PUBLIC_KEY, {
            algorithms: ["RS256"],
        });
        if (!(0, validations_1.isAlphanumeric)(payload.customer))
            return null;
        const customer = await customer_schema_1.CustomerModel.findById(payload.customer)
            .select("_id authTokenVersion")
            .lean();
        if (!customer || customer.authTokenVersion !== payload.version)
            return null;
        const storedHash = await redis_1.redisClient.get(`customerRefreshToken:${customer._id}:${payload.uniqueId}`);
        if (!storedHash || storedHash !== hashToken(rToken))
            return null;
        const { accessToken, refreshToken } = (0, exports.createCustomerAuthTokens)({
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
    }
    catch {
        return null;
    }
};
exports.refreshCustomerAuthTokens = refreshCustomerAuthTokens;
const storeCustomerRefreshToken = async (customerId, uniqueId, refreshToken) => {
    const key = `customerRefreshToken:${customerId}:${uniqueId}`;
    await redis_1.redisClient.setex(key, REFRESH_TOKEN_TTL_SECONDS, hashToken(refreshToken));
};
exports.storeCustomerRefreshToken = storeCustomerRefreshToken;
const revokeCustomerRefreshToken = async (customerId, uniqueId) => {
    await redis_1.redisClient.del(`customerRefreshToken:${customerId}:${uniqueId}`);
};
exports.revokeCustomerRefreshToken = revokeCustomerRefreshToken;
// --- Scanner tokens ---
const SCANNER_ACCESS_TOKEN_EXPIRY = "12h";
const SCANNER_REFRESH_TOKEN_EXPIRY = "7d";
const SCANNER_REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const createScannerAuthTokens = (payload) => ({
    accessToken: jsonwebtoken_1.default.sign(payload, PRIVATE_KEY, {
        expiresIn: SCANNER_ACCESS_TOKEN_EXPIRY,
        algorithm: "RS256",
    }),
    refreshToken: jsonwebtoken_1.default.sign(payload, PRIVATE_KEY, {
        expiresIn: SCANNER_REFRESH_TOKEN_EXPIRY,
        algorithm: "RS256",
    }),
});
exports.createScannerAuthTokens = createScannerAuthTokens;
// Per-scanner Redis allowlist. Mirrors the customer pattern: store
// only the sha256 hash of the latest refresh token, so a leaked Redis
// dump can't be replayed. A scanner only has ONE active refresh at a
// time — the most recent login or refresh wins.
const scannerRefreshKey = (scannerId) => `scannerRefreshToken:${scannerId}`;
const storeScannerRefreshToken = async (scannerId, refreshToken) => {
    await redis_1.redisClient.setex(scannerRefreshKey(scannerId), SCANNER_REFRESH_TOKEN_TTL_SECONDS, hashToken(refreshToken));
};
exports.storeScannerRefreshToken = storeScannerRefreshToken;
const revokeScannerRefreshToken = async (scannerId) => {
    await redis_1.redisClient.del(scannerRefreshKey(scannerId));
};
exports.revokeScannerRefreshToken = revokeScannerRefreshToken;
const verifyScannerAccessToken = async (token) => {
    try {
        const payload = jsonwebtoken_1.default.verify(token, PUBLIC_KEY, {
            algorithms: ["RS256"],
        });
        if (!payload?.scanner || !(0, validations_1.isAlphanumeric)(payload.scanner))
            return null;
        const scanner = await scanner_user_schema_1.ScannerUserModel.findOne({
            _id: payload.scanner,
            isDeleted: false,
            isActive: true,
        })
            .select("_id authTokenVersion eventId businessId")
            .lean();
        if (!scanner)
            return null;
        if (scanner.authTokenVersion !== payload.version)
            return null;
        if (scanner.eventId !== payload.eventId)
            return null;
        return payload;
    }
    catch {
        return null;
    }
};
exports.verifyScannerAccessToken = verifyScannerAccessToken;
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
const refreshScannerAuthTokens = async (refreshToken) => {
    const payload = await (0, exports.verifyScannerAccessToken)(refreshToken);
    if (!payload)
        return null;
    // Allowlist check — only the most recently issued refresh token for
    // this scanner is valid. A stolen older refresh token (e.g. captured
    // before a legitimate refresh rotated it out) fails here even though
    // the JWT signature + authTokenVersion would otherwise let it pass.
    const storedHash = await redis_1.redisClient.get(scannerRefreshKey(payload.scanner));
    if (!storedHash || storedHash !== hashToken(refreshToken)) {
        return null;
    }
    const pair = (0, exports.createScannerAuthTokens)({
        scanner: payload.scanner,
        eventId: payload.eventId,
        businessId: payload.businessId,
        version: payload.version,
    });
    // Rotate the allowlist: the old token's hash is overwritten by the
    // new one's. The same token presented again will fail the storedHash
    // check above.
    await (0, exports.storeScannerRefreshToken)(payload.scanner, pair.refreshToken);
    return pair;
};
exports.refreshScannerAuthTokens = refreshScannerAuthTokens;
