"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readTokenFromRequest = exports.clearCustomerCookie = exports.setCustomerCookie = exports.ScannerCookieKeys = exports.CustomerCookieKeys = void 0;
const environment_1 = require("./environment");
const helper_1 = require("./helper");
class CustomerCookieKeys {
}
exports.CustomerCookieKeys = CustomerCookieKeys;
CustomerCookieKeys.ACCESS_TOKEN = "customerAccessToken";
CustomerCookieKeys.REFRESH_TOKEN = "customerRefreshToken";
CustomerCookieKeys.UNIQUE_ID = "customerUniqueId";
class ScannerCookieKeys {
}
exports.ScannerCookieKeys = ScannerCookieKeys;
ScannerCookieKeys.ACCESS_TOKEN = "scannerAccessToken";
ScannerCookieKeys.REFRESH_TOKEN = "scannerRefreshToken";
/**
 * Customer auth uses a 90-day refresh token (see `REFRESH_TOKEN_EXPIRY`
 * in customer-server/src/utils/jwt.ts), so we cap the cookie at the same
 * value rather than the old `3.154e10` (~1000 years). Cookies that
 * outlive their token are a TOCTOU footgun on logout / rotation.
 */
const REFRESH_COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
const cookieDomain = () => environment_1.EnvVars.values.COOKIE_DOMAIN || undefined;
const productionCookieOptions = () => ({
    maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
    httpOnly: true,
    sameSite: "none",
    secure: true,
    ...(cookieDomain() ? { domain: cookieDomain() } : {}),
    path: "/",
});
const developmentCookieOptions = () => ({
    maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
});
const setCustomerCookie = (cookieKey, cookieValue, rep) => {
    rep.setCookie(cookieKey, cookieValue, helper_1.isProduction ? productionCookieOptions() : developmentCookieOptions());
};
exports.setCustomerCookie = setCustomerCookie;
const clearCustomerCookie = (cookieKey, rep) => {
    rep.clearCookie(cookieKey, helper_1.isProduction ? productionCookieOptions() : developmentCookieOptions());
};
exports.clearCustomerCookie = clearCustomerCookie;
const readTokenFromRequest = (req, cookieKey) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
        return authHeader.slice(7).trim();
    }
    return req.cookies?.[cookieKey];
};
exports.readTokenFromRequest = readTokenFromRequest;
