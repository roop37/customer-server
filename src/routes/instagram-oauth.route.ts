import type { FastifyInstance } from "fastify";
import { logger } from "../log/logger";
import CustomerInstagramService from "../modules/customerInstagram/service/customer-instagram.service";
import {
  signState,
  verifyState,
} from "../modules/customerInstagram/util/token-crypto";
import { EnvVars } from "../utils/environment";
import {
  CustomerCookieKeys,
  readTokenFromRequest,
} from "../utils/cookie";
import { verifyCustomerAccessToken } from "../utils/jwt";

/**
 * Instagram OAuth handoff routes (Instagram API with Instagram Login —
 * Basic Display's successor, since Basic Display was sunset by Meta on
 * 2024-12-04).
 *
 *  GET /auth/instagram/start
 *    Reads the customer's auth cookie, signs a state blob, and
 *    302-redirects to Instagram's authorize endpoint. Browser sees a
 *    normal full-page navigation.
 *
 *  GET /auth/instagram/callback
 *    Instagram redirects here with ?code=... &state=...
 *    Verifies state, exchanges code → long-lived token, fetches profile
 *    + last 10 media, upserts the customer_instagram doc, then
 *    302-redirects back to hoizr-client's /me/profile?ig=connected.
 *
 * Both routes return a plain redirect (no JSON) so the customer never
 * sees a raw GraphQL surface and the browser back-button works.
 */

const AUTHORIZE_BASE = "https://www.instagram.com/oauth/authorize";

// Per docs, the recommended scopes for the new Instagram API with
// Instagram Login. `instagram_business_basic` covers profile fields +
// last-N media (the only data we need); the *_publish / *_manage
// scopes would require App Review at higher tiers and we don't ship
// them for our read-only feature.
const SCOPES = ["instagram_business_basic"];

const buildAuthorizeUrl = (state: string): string => {
  const u = new URL(AUTHORIZE_BASE);
  u.searchParams.set("client_id", EnvVars.values.META_INSTAGRAM_APP_ID!);
  u.searchParams.set("redirect_uri", EnvVars.values.META_INSTAGRAM_REDIRECT_URI!);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", SCOPES.join(","));
  u.searchParams.set("state", state);
  return u.toString();
};

const buildReturnUrl = (params: Record<string, string>): string => {
  const fallback = "/me/profile";
  const base = EnvVars.values.META_INSTAGRAM_FRONTEND_RETURN ?? fallback;
  const u = base.startsWith("http")
    ? new URL(base)
    : new URL(base, "https://hoizr.com");
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, v);
  }
  // Strip the synthetic origin when we built relative — Fastify accepts
  // relative redirects which is what we want for same-host envs.
  if (!base.startsWith("http")) {
    return `${u.pathname}${u.search}`;
  }
  return u.toString();
};

export const registerInstagramOAuth = (app: FastifyInstance) => {
  const service = new CustomerInstagramService();

  // Without Meta env vars, the routes still register but respond with
  // a clear "not configured" error so an operator can spot a missing
  // env var without trawling logs.
  app.get("/auth/instagram/start", async (req, reply) => {
    if (!service.isRealMetaConfigured()) {
      reply.code(503).send({
        error:
          "Instagram OAuth is not configured on this server. Set META_INSTAGRAM_APP_ID, META_INSTAGRAM_APP_SECRET, META_INSTAGRAM_REDIRECT_URI, META_INSTAGRAM_STATE_SECRET, and META_INSTAGRAM_TOKEN_KEY.",
      });
      return;
    }

    const accessToken = readTokenFromRequest(
      req as any,
      CustomerCookieKeys.ACCESS_TOKEN
    );
    if (!accessToken) {
      reply.code(401).send({ error: "Sign in to connect Instagram" });
      return;
    }
    const customer = await verifyCustomerAccessToken(accessToken);
    if (!customer) {
      reply.code(401).send({ error: "Sign in to connect Instagram" });
      return;
    }

    const state = signState(customer._id);
    const authorizeUrl = buildAuthorizeUrl(state);
    reply.redirect(authorizeUrl);
  });

  app.get("/auth/instagram/callback", async (req, reply) => {
    const query = (req.query as Record<string, string | undefined>) ?? {};
    // Meta surfaces user-cancelled or scope-rejected flows here too.
    // Bail with a soft redirect to the profile page so the user sees a
    // banner instead of a raw error JSON.
    if (query.error) {
      const message = query.error_description ?? query.error;
      logger.warn(
        `Instagram OAuth callback rejected: ${query.error} ${query.error_description ?? ""}`
      );
      reply.redirect(
        buildReturnUrl({ ig: "denied", reason: String(message) })
      );
      return;
    }
    if (!query.code || !query.state) {
      reply.redirect(buildReturnUrl({ ig: "denied", reason: "missing_params" }));
      return;
    }

    try {
      const payload = verifyState(query.state);
      await service.connectInstagramFromOAuth(payload.customerId, query.code);
      reply.redirect(buildReturnUrl({ ig: "connected" }));
    } catch (err: any) {
      logger.error(
        `Instagram OAuth callback failed: ${err?.message ?? err}`
      );
      reply.redirect(
        buildReturnUrl({
          ig: "error",
          reason: String(err?.message ?? "exchange_failed"),
        })
      );
    }
  });
};
