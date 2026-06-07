"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidEmail = exports.normalizeCustomerPhone = exports.isValidPhone = exports.isAlphanumeric = void 0;
const shared_1 = require("@hoizr-technology/shared");
const isAlphanumeric = (value) => {
    return /^[a-zA-Z0-9]+$/.test(value);
};
exports.isAlphanumeric = isAlphanumeric;
/**
 * Loose phone validator kept for backwards-compat with call-sites that
 * just need to reject obviously-broken input. New code should normalise
 * via `normalizeCustomerPhone` instead — that returns the E.164 form so
 * downstream lookups + storage are consistent.
 */
const isValidPhone = (phone) => {
    return /^\+?[1-9]\d{7,14}$/.test(phone);
};
exports.isValidPhone = isValidPhone;
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
const normalizeCustomerPhone = (phone) => {
    if (typeof phone !== "string")
        return null;
    const raw = phone.trim();
    if (!raw)
        return null;
    const e164 = (0, shared_1.toE164)(raw, "IN");
    if (!e164 || !(0, shared_1.isValidE164)(e164))
        return null;
    return { raw, e164 };
};
exports.normalizeCustomerPhone = normalizeCustomerPhone;
const isValidEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};
exports.isValidEmail = isValidEmail;
