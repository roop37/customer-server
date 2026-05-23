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

const productionCookieOptions = () => ({
  maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
  httpOnly: true,
  sameSite: "none" as const,
  secure: true,
  ...(cookieDomain() ? { domain: cookieDomain() as string } : {}),
  path: "/",
});

const developmentCookieOptions = () => ({
  maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
});

export const setCustomerCookie = (
  cookieKey: string,
  cookieValue: string,
  rep: FastifyReply
) => {
  rep.setCookie(
    cookieKey,
    cookieValue,
    isProduction ? productionCookieOptions() : developmentCookieOptions()
  );
};

export const clearCustomerCookie = (cookieKey: string, rep: FastifyReply) => {
  rep.clearCookie(
    cookieKey,
    isProduction ? productionCookieOptions() : developmentCookieOptions()
  );
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
