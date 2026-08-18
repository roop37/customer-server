import type { FastifyInstance } from "fastify";
import axios from "axios";
import { logger } from "../log/logger";
import {
  swiggyDineoutConfig,
  isSwiggyDineoutReady,
  SWIGGY_DINEOUT_DISABLED_MESSAGE,
} from "../modules/dineout/config";
import { generatePkcePair } from "../modules/dineout/util/pkce";
import {
  genOAuthState,
  saveOAuthState,
  consumeOAuthState,
} from "../modules/dineout/oauth-state.store";
import { SwiggyConnectionService } from "../modules/dineout/service/swiggy-connection.service";
import { CustomerCookieKeys, readTokenFromRequest } from "../utils/cookie";
import { verifyCustomerAccessToken } from "../utils/jwt";
import { EnvVars } from "../utils/environment";

/**
 * Swiggy Dineout PKCE OAuth handoff (server-side only; the per-user token
 * never reaches the browser).
 *
 *  GET /auth/swiggy/start    — auth the Hoizr customer, generate PKCE +
 *                              state, stash {customerId, codeVerifier} in
 *                              Redis, 302 to Swiggy authorize.
 *  GET /auth/swiggy/callback — verify state, exchange code+verifier for the
 *                              per-user token, upsert the vault, redirect.
 *
 * Swiggy is a public OAuth client: no client secret. The client_id comes
 * from one-time Dynamic Client Registration (SWIGGY_CLIENT_ID). While the
 * 30-day Swiggy session is alive, hitting /start again silently re-auths
 * (no phone+OTP re-prompt); only a 419/revocation forces full OTP.
 */

/**
 * Where to bounce the browser after the OAuth handshake. This callback runs
 * on customer-server (the API origin, e.g. dev-orderapi.hoizr.com), but the
 * /dineout page lives on hoizr-client (a DIFFERENT origin, e.g. dev.hoizr.com)
 * — so the return MUST be absolute in any cross-host deploy. Mirrors the
 * Instagram route's META_INSTAGRAM_FRONTEND_RETURN idiom: when
 * SWIGGY_FRONTEND_RETURN is an absolute URL we redirect there; otherwise we
 * fall back to a relative path (only correct when the frontend is same-host).
 */
const buildReturnUrl = (params: Record<string, string>): string => {
  const base = EnvVars.values.SWIGGY_FRONTEND_RETURN ?? "/dineout";
  const u = base.startsWith("http")
    ? new URL(base)
    : new URL(base, "https://hoizr.com");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  if (!base.startsWith("http")) {
    return `${u.pathname}${u.search}`; // relative redirect (same-host only)
  }
  return u.toString();
};

const buildAuthorizeUrl = (state: string, codeChallenge: string): string => {
  const { mcpBase, clientId, redirectUri } = swiggyDineoutConfig();
  const u = new URL(`${mcpBase}/auth/authorize`);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId!);
  u.searchParams.set("redirect_uri", redirectUri!);
  u.searchParams.set("code_challenge", codeChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("state", state);
  u.searchParams.set("scope", "mcp:tools");
  return u.toString();
};

/**
 * The Swiggy access token is a signed JWT whose claims include `user_id`.
 * Decode the payload segment (no verification — we only need the id to hash
 * it; the token's authority comes from Swiggy accepting it on tool calls).
 * Falls back to the token tail so we always persist a non-PII value.
 */
const extractSwiggyUserId = (accessToken: string): string => {
  try {
    const payloadB64 = accessToken.split(".")[1];
    if (payloadB64) {
      const claims = JSON.parse(
        Buffer.from(payloadB64, "base64url").toString("utf8")
      );
      const id = claims?.user_id ?? claims?.sub;
      if (id !== undefined && id !== null) return String(id);
    }
  } catch {
    // fall through to the tail fallback
  }
  return `tok_${accessToken.slice(-16)}`;
};

export const registerSwiggyOAuth = (app: FastifyInstance) => {
  const connections = new SwiggyConnectionService();

  app.get("/auth/swiggy/start", async (req, reply) => {
    if (!isSwiggyDineoutReady()) {
      reply.code(503).send({ error: SWIGGY_DINEOUT_DISABLED_MESSAGE });
      return;
    }
    const accessToken = readTokenFromRequest(
      req as any,
      CustomerCookieKeys.ACCESS_TOKEN
    );
    const customer = accessToken
      ? await verifyCustomerAccessToken(accessToken)
      : null;
    if (!customer) {
      reply.code(401).send({ error: "Sign in to connect Swiggy" });
      return;
    }
    const { codeVerifier, codeChallenge } = generatePkcePair();
    const state = genOAuthState();
    await saveOAuthState(state, { customerId: customer._id, codeVerifier });
    reply.redirect(buildAuthorizeUrl(state, codeChallenge));
  });

  app.get("/auth/swiggy/callback", async (req, reply) => {
    if (!isSwiggyDineoutReady()) {
      reply.code(503).send({ error: SWIGGY_DINEOUT_DISABLED_MESSAGE });
      return;
    }
    const query = (req.query as Record<string, string | undefined>) ?? {};
    if (query.error) {
      reply.redirect(
        buildReturnUrl({ swiggy: "denied", reason: String(query.error) })
      );
      return;
    }
    if (!query.code || !query.state) {
      reply.redirect(buildReturnUrl({ swiggy: "denied", reason: "missing_params" }));
      return;
    }
    const entry = await consumeOAuthState(query.state);
    if (!entry) {
      reply.redirect(buildReturnUrl({ swiggy: "error", reason: "state_invalid" }));
      return;
    }
    try {
      const { mcpBase, redirectUri, clientId } = swiggyDineoutConfig();
      const tokenRes = await axios.post(
        `${mcpBase}/auth/token`,
        {
          grant_type: "authorization_code",
          code: query.code,
          code_verifier: entry.codeVerifier,
          redirect_uri: redirectUri,
          // Delegated-auth examples include client_id in the body; harmless
          // for a public client if the direct flow ignores it (verify in dev).
          client_id: clientId,
        },
        { headers: { "Content-Type": "application/json" }, timeout: 15000 }
      );
      const accessToken: string = tokenRes.data?.access_token;
      if (!accessToken) throw new Error("no_access_token_in_response");
      // Swiggy access token = 5 days (expires_in: 432000).
      const expiresIn: number = tokenRes.data?.expires_in ?? 5 * 24 * 3600;
      const swiggyUserId = extractSwiggyUserId(accessToken);
      await connections.upsertConnection({
        customerId: entry.customerId,
        accessToken,
        expiresInSec: expiresIn,
        swiggyUserId,
      });
      reply.redirect(buildReturnUrl({ swiggy: "connected" }));
    } catch (err: any) {
      logger.error(`Swiggy OAuth callback failed: ${err?.message ?? err}`);
      reply.redirect(buildReturnUrl({ swiggy: "error", reason: "exchange_failed" }));
    }
  });
};
