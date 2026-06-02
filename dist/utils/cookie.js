"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readTokenFromRequest = exports.clearCustomerCookie = exports.setCustomerCookie = exports.buildCustomerCookieOptions = exports.ScannerCookieKeys = exports.CustomerCookieKeys = void 0;
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
const productionCookieScopeOptions = (domain = cookieDomain()) => ({
    httpOnly: true,
    sameSite: "none",
    secure: true,
    ...(domain ? { domain } : {}),
    path: "/",
});
const developmentCookieScopeOptions = () => ({
    httpOnly: true,
    sameSite: "lax",
    path: "/",
});
const buildCustomerCookieScopeOptions = (domain = cookieDomain(), production = helper_1.isProduction) => {
    if (production || domain) {
        return productionCookieScopeOptions(domain);
    }
    return developmentCookieScopeOptions();
};
const buildCustomerCookieOptions = (domain = cookieDomain(), production = helper_1.isProduction) => ({
    maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
    ...buildCustomerCookieScopeOptions(domain, production),
});
exports.buildCustomerCookieOptions = buildCustomerCookieOptions;
// Options that match a host-only cookie (no Domain attribute). Used to
// evict cookies left over from pre-COOKIE_DOMAIN deploys, which got scoped
// to the bare host (dev-customer.hoizr.com etc.) and now sit alongside the
// new .hoizr.com-scoped cookies, confusing the Cookie header parser.
const buildHostOnlyScopeOptions = () => helper_1.isProduction
    ? { httpOnly: true, sameSite: "none", secure: true, path: "/" }
    : { httpOnly: true, sameSite: "lax", path: "/" };
const setCustomerCookie = (cookieKey, cookieValue, rep) => {
    const domain = cookieDomain();
    if (domain) {
        rep.clearCookie(cookieKey, buildHostOnlyScopeOptions());
    }
    rep.setCookie(cookieKey, cookieValue, (0, exports.buildCustomerCookieOptions)(domain));
};
exports.setCustomerCookie = setCustomerCookie;
const clearCustomerCookie = (cookieKey, rep) => {
    const domain = cookieDomain();
    rep.clearCookie(cookieKey, buildCustomerCookieScopeOptions(domain));
    if (domain) {
        rep.clearCookie(cookieKey, buildHostOnlyScopeOptions());
    }
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
