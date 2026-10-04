"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnvVars = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const zod_1 = require("zod");
dotenv_1.default.config({ path: ".env" });
const zodEnvSchema = zod_1.z.object({
    DB_URI: zod_1.z.string().min(1, "DB_URI is not present"),
    DB_NAME: zod_1.z.string().min(1, "DB_NAME is not present"),
    REDIS_HOST: zod_1.z.string().min(1, "REDIS_HOST is not present"),
    REDIS_PORT: zod_1.z.string().min(1, "REDIS_PORT is not present"),
    REDIS_TLS: zod_1.z.string().min(1, "REDIS_TLS is not present"),
    PUBLIC_KEY: zod_1.z.string().min(1, "PUBLIC_KEY is not present"),
    PRIVATE_KEY: zod_1.z.string().min(1, "PRIVATE_KEY is not present"),
    ENCRYPTION_KEY: zod_1.z.string().min(1, "ENCRYPTION_KEY is not present"),
    CLIENT_ENCRYPTION_KEY: zod_1.z.string().min(1, "CLIENT_ENCRYPTION_KEY is not present"),
    COOKIE_SECRET: zod_1.z.string().min(1, "COOKIE_SECRET is not present"),
    APP_URL: zod_1.z.string().min(1, "APP_URL is not present").url("APP_URL is not a valid URL"),
    PORT: zod_1.z.string().optional().default("4001"),
    CUSTOMER_CORS_ORIGINS: zod_1.z.string().optional().default(""),
    // Cookie domain. When set, cookies are scoped to this domain so all
    // *.hoizr.com surfaces share auth. Leave unset on preview deploys /
    // staging so the browser falls back to the request host.
    COOKIE_DOMAIN: zod_1.z.string().optional(),
    SERVER_ENV: zod_1.z.string().min(1, "SERVER_ENV is not present"),
    RAZORPAY_KEY_ID: zod_1.z.string().min(1, "RAZORPAY_KEY_ID is not present"),
    RAZORPAY_KEY_SECRET: zod_1.z.string().min(1, "RAZORPAY_KEY_SECRET is not present"),
    RAZORPAY_WEBHOOK_SECRET: zod_1.z.string().min(1, "RAZORPAY_WEBHOOK_SECRET is not present"),
    // Shared secret for HMAC-authenticated internal service calls (main-server
    // → customer-server, e.g. issuing an offline ticket order). Optional at
    // boot; when unset the internal route rejects every call (fails closed).
    // Must match main-server's INTERNAL_SERVICE_SECRET in each environment.
    INTERNAL_SERVICE_SECRET: zod_1.z.string().optional(),
    // Cloudinary credentials. Optional at this layer — hoizr-workers
    // writes the invoice PDFs; customer-server only re-signs short-lived
    // download URLs on demand for the "Download invoice" button. When the
    // credentials aren't present (e.g. local dev without invoice infra),
    // the resolver surfaces a clear error instead of crashing at boot.
    CLOUDINARY_CLOUD_NAME: zod_1.z.string().optional(),
    CLOUDINARY_API_KEY: zod_1.z.string().optional(),
    CLOUDINARY_API_SECRET: zod_1.z.string().optional(),
    // Google OAuth web client ID. Used server-side to verify the ID token
    // returned by @react-oauth/google on hoizr-client. The same client ID
    // must be configured on the frontend (NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID).
    GOOGLE_OAUTH_CLIENT_ID: zod_1.z.string().min(1, "GOOGLE_OAUTH_CLIENT_ID is not present"),
    // Instagram API with Instagram Login (the successor to the deprecated
    // Basic Display API). All four are optional — when META_INSTAGRAM_APP_ID
    // is unset the connect mutation falls back to the deterministic stub
    // fetcher so the feature stays demoable. See docs/INSTAGRAM_CONNECT.md
    // for the dashboard setup that produces these values.
    //
    // META_INSTAGRAM_APP_ID          — the Instagram App ID from
    //                                  developers.facebook.com → your app →
    //                                  Use cases → Instagram → API setup with
    //                                  Instagram Login → "Instagram App ID".
    // META_INSTAGRAM_APP_SECRET      — paired secret. Server-side only.
    // META_INSTAGRAM_REDIRECT_URI    — must match the OAuth Redirect URI
    //                                  configured on Meta byte-for-byte.
    // META_INSTAGRAM_STATE_SECRET    — hex string used to HMAC the OAuth
    //                                  `state` blob. `openssl rand -hex 32`.
    // META_INSTAGRAM_TOKEN_KEY       — 64-hex AES-256 key used to encrypt
    //                                  the long-lived access token before
    //                                  persisting to Mongo. `openssl rand -hex 32`.
    // META_INSTAGRAM_FRONTEND_RETURN — URL on hoizr-client to bounce back to
    //                                  after the callback finishes (e.g.
    //                                  https://hoizr.com/me/profile).
    META_INSTAGRAM_APP_ID: zod_1.z.string().optional(),
    META_INSTAGRAM_APP_SECRET: zod_1.z.string().optional(),
    META_INSTAGRAM_REDIRECT_URI: zod_1.z.string().optional(),
    META_INSTAGRAM_STATE_SECRET: zod_1.z.string().optional(),
    META_INSTAGRAM_TOKEN_KEY: zod_1.z.string().optional(),
    META_INSTAGRAM_FRONTEND_RETURN: zod_1.z.string().optional(),
    // --- Swiggy Dineout MCP (connect-only; dev-gated until production access) ---
    // All optional so boot never breaks when unset. `isSwiggyDineoutReady()`
    // (modules/dineout/config.ts) gates on the flag AND the required secrets.
    // SWIGGY_CLIENT_ID comes from one-time Dynamic Client Registration
    // (POST /auth/register), NOT a Swiggy-issued id; no client secret exists.
    // SWIGGY_TOKEN_ENCRYPTION_KEY: 64-hex (32 bytes) — `openssl rand -hex 32`.
    SWIGGY_DINEOUT_ENABLED: zod_1.z.string().optional().default("false"),
    SWIGGY_CLIENT_ID: zod_1.z.string().optional(),
    SWIGGY_OAUTH_REDIRECT_URI: zod_1.z.string().optional(),
    SWIGGY_MCP_BASE: zod_1.z.string().optional().default("https://mcp.swiggy.com"),
    SWIGGY_TOKEN_ENCRYPTION_KEY: zod_1.z.string().optional(),
    // Absolute hoizr-client URL to bounce back to after the OAuth handshake.
    // The callback runs on the API origin, but /dineout is on the frontend
    // origin — must be absolute cross-host (e.g. https://dev.hoizr.com/dineout).
    SWIGGY_FRONTEND_RETURN: zod_1.z.string().optional(),
    // Reservation confirmation/reminder notifications for Swiggy Dineout
    // bookings (own-customer, transactional only — see reservation-notify.ts).
    // Default off until posture is confirmed; flippable without a deploy.
    SWIGGY_DINEOUT_REMINDERS_ENABLED: zod_1.z.string().optional().default("false"),
    // Meta-approved WhatsApp template names. Dormant until both isWhatsAppLive()
    // AND the relevant template env are set — no template configured yet.
    WHATSAPP_DINEOUT_CONFIRM_TEMPLATE: zod_1.z.string().optional(),
    WHATSAPP_DINEOUT_REMINDER_TEMPLATE: zod_1.z.string().optional(),
    // Google Maps server-side key used by the address-autocomplete
    // queries on /me/profile. Optional — when unset, the resolver
    // surfaces a clear error so misconfigured environments fail loud
    // rather than 200-OKing with empty results.
    MAPS_API_KEY: zod_1.z.string().optional(),
    // Waitlist social collection: while Meta app verification is pending we
    // collect plain-string handles at waitlist-join instead of the verified
    // Instagram Connect. Flip to "true" once verified to switch to Connect.
    // Source of truth for the gate — hoizr-client reads a mirror for UI only.
    META_VERIFIED: zod_1.z.string().optional().default("false"),
});
class EnvVars {
    static initialize() {
        if (!this.envVars) {
            try {
                this.envVars = zodEnvSchema.parse(process.env);
            }
            catch (error) {
                console.error("Environment Variables Error", {
                    error: { message: error.errors ?? error.toString() },
                });
                process.exit(1);
            }
        }
    }
    static get values() {
        if (!this.envVars) {
            throw new Error("Environment variables are not initialized. Please call EnvVars.initialize() at startup.");
        }
        return this.envVars;
    }
}
exports.EnvVars = EnvVars;
EnvVars.envVars = null;
EnvVars.initialize();
