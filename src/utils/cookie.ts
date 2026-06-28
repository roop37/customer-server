import type { FastifyReply, FastifyRequest } from "fastify";
import { EnvVars } from "./environment";
import { isProduction } from "./helper";

export class CustomerCookieKeys {
  static readonly ACCESS_TOKEN = "customerAccessToken";
  static readonly REFRESH_TOKEN = "customerRefreshToken";
  static readonly UNIQUE_ID = "customerUniqueId";
}

export class ScannerCookieKeys {
  static readonly ACCESS_TOKEN = "scannerAccessToken";
  static readonly REFRESH_TOKEN = "scannerRefreshToken";
}

/**
 * Customer auth uses a 90-day refresh token (see `REFRESH_TOKEN_EXPIRY`
 * in customer-server/src/utils/jwt.ts), so we cap the cookie at the same
 * value rather than the old `3.154e10` (~1000 years). Cookies that
 * outlive their token are a TOCTOU footgun on logout / rotation.
 */
const REFRESH_COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

const cookieDomain = () => EnvVars.values.COOKIE_DOMAIN || undefined;

type CustomerCookieOptions = {
  maxAge: number;
  httpOnly: true;
  sameSite: "none" | "lax";
  secure?: true;
  domain?: string;
  path: "/";
};

type CustomerCookieScopeOptions = Omit<CustomerCookieOptions, "maxAge">;

const productionCookieScopeOptions = (
  domain: string | undefined = cookieDomain()
): CustomerCookieScopeOptions => ({
  httpOnly: true,
  sameSite: "none" as const,
  secure: true,
  ...(domain ? { domain } : {}),
  path: "/",
});

const developmentCookieScopeOptions = (): CustomerCookieScopeOptions => ({
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
});

const buildCustomerCookieScopeOptions = (
  domain: string | undefined = cookieDomain(),
  production: boolean = isProduction
) => {
  if (production || domain) {
    return productionCookieScopeOptions(domain);
  }

  return developmentCookieScopeOptions();
};

export const buildCustomerCookieOptions = (
  domain: string | undefined = cookieDomain(),
  production: boolean = isProduction
): CustomerCookieOptions => ({
  maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
  ...buildCustomerCookieScopeOptions(domain, production),
});

// Options that match a host-only cookie (no Domain attribute). Used to
// evict cookies left over from pre-COOKIE_DOMAIN deploys, which got scoped
// to the bare host (dev-customer.hoizr.com etc.) and now sit alongside the
// new .hoizr.com-scoped cookies, confusing the Cookie header parser.
const buildHostOnlyScopeOptions = (): CustomerCookieScopeOptions =>
  isProduction
    ? { httpOnly: true, sameSite: "none" as const, secure: true, path: "/" }
    : { httpOnly: true, sameSite: "lax" as const, path: "/" };

export const setCustomerCookie = (
  cookieKey: string,
  cookieValue: string,
  rep: FastifyReply
) => {
  const domain = cookieDomain();
  if (domain) {
    rep.clearCookie(cookieKey, buildHostOnlyScopeOptions());
  }
  rep.setCookie(cookieKey, cookieValue, buildCustomerCookieOptions(domain));
};

export const clearCustomerCookie = (cookieKey: string, rep: FastifyReply) => {
  const domain = cookieDomain();
  rep.clearCookie(cookieKey, buildCustomerCookieScopeOptions(domain));
  if (domain) {
    rep.clearCookie(cookieKey, buildHostOnlyScopeOptions());
  }
};

export const readTokenFromRequest = (
  req: FastifyRequest,
  cookieKey: string
): string | undefined => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  return req.cookies?.[cookieKey];
};
