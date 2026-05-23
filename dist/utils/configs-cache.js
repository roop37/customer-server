"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCachedConfigNumber = void 0;
const shared_1 = require("@hoizr-technology/shared");
const typegoose_1 = require("@typegoose/typegoose");
const logger_1 = require("../log/logger");
const redis_1 = require("./redis");
const ConfigsModel = (0, typegoose_1.getModelForClass)(shared_1.Config);
const TTL_SECONDS = 300; // 5 min cache, mirrors choose-pos pattern.
const KEY_PREFIX = "config:num:";
/**
 * Reads a numeric masters Config row through a Redis cache so the hot
 * path (cart pricing, GST calc, etc.) doesn't hit Mongo on every
 * checkout. Falls back to the provided `fallback` when neither cache
 * nor DB has a value.
 *
 * Admin edits invalidate the row by writing to ConfigsModel — Redis
 * naturally expires after TTL_SECONDS so admins see new values within
 * 5 minutes without any explicit bust call. If we ever need faster
 * propagation, expose an invalidateConfigCache() helper that the admin
 * mutation calls.
 */
const getCachedConfigNumber = async (type, fallback) => {
    const key = `${KEY_PREFIX}${type}`;
    try {
        const cached = await redis_1.redisClient.get(key);
        if (cached != null) {
            const n = Number(cached);
            return Number.isFinite(n) ? n : fallback;
        }
    }
    catch (err) {
        logger_1.logger.warn(`config cache GET failed for ${type}: ${err?.message ?? err}`);
    }
    let value = fallback;
    try {
        const row = await ConfigsModel.findOne({ type })
            .select("numVal")
            .lean();
        if (row &&
            typeof row.numVal === "number" &&
            Number.isFinite(row.numVal)) {
            value = row.numVal;
        }
    }
    catch (err) {
        logger_1.logger.warn(`config DB read failed for ${type}: ${err?.message ?? err}`);
    }
    try {
        await redis_1.redisClient.setex(key, TTL_SECONDS, String(value));
    }
    catch (err) {
        logger_1.logger.warn(`config cache SET failed for ${type}: ${err?.message ?? err}`);
    }
    return value;
};
exports.getCachedConfigNumber = getCachedConfigNumber;
