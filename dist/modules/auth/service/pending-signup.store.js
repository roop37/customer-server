"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deletePendingSignup = exports.updatePendingSignup = exports.readPendingSignup = exports.createPendingSignup = void 0;
const crypto_1 = __importDefault(require("crypto"));
const nanoid_1 = require("nanoid");
const redis_1 = require("../../../utils/redis");
const KEY_PREFIX = "customerPendingSignup:";
const TTL_SECONDS = 600; // 10 minutes — enough to enter phone + OTP
// Pending tokens are stored under a sha256 hash of the raw token so a
// Redis dump can't be replayed against the OAuth signup flow. The raw
// token is returned to the client exactly once (at create time).
const hashToken = (token) => crypto_1.default.createHash("sha256").update(token).digest("hex");
const keyFor = (token) => `${KEY_PREFIX}${hashToken(token)}`;
const createPendingSignup = async (entry) => {
    const token = (0, nanoid_1.nanoid)(32);
    const payload = { ...entry, createdAt: Date.now() };
    await redis_1.redisClient.setex(keyFor(token), TTL_SECONDS, JSON.stringify(payload));
    return token;
};
exports.createPendingSignup = createPendingSignup;
const readPendingSignup = async (token) => {
    if (!token)
        return null;
    const raw = await redis_1.redisClient.get(keyFor(token));
    if (!raw)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
};
exports.readPendingSignup = readPendingSignup;
const updatePendingSignup = async (token, patch) => {
    const current = await (0, exports.readPendingSignup)(token);
    if (!current)
        return null;
    const next = { ...current, ...patch };
    // Preserve the original TTL window — extending it on every update
    // would let a stuck pending entry live forever. If the key has
    // already expired between read and write (`ttl()` returns -2) or
    // has no TTL set (`-1`), fall back to the canonical TTL_SECONDS so
    // `setex` never receives a non-positive duration (which is undefined
    // behavior across Redis versions).
    const remaining = await redis_1.redisClient.ttl(keyFor(token));
    const safeTtl = remaining > 0 ? remaining : TTL_SECONDS;
    await redis_1.redisClient.setex(keyFor(token), safeTtl, JSON.stringify(next));
    return next;
};
exports.updatePendingSignup = updatePendingSignup;
const deletePendingSignup = async (token) => {
    if (!token)
        return;
    await redis_1.redisClient.del(keyFor(token));
};
exports.deletePendingSignup = deletePendingSignup;
