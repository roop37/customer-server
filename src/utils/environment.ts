import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: ".env" });

const zodEnvSchema = z.object({
  DB_URI: z.string().min(1, "DB_URI is not present"),
  DB_NAME: z.string().min(1, "DB_NAME is not present"),

  REDIS_HOST: z.string().min(1, "REDIS_HOST is not present"),
  REDIS_PORT: z.string().min(1, "REDIS_PORT is not present"),
  REDIS_TLS: z.string().min(1, "REDIS_TLS is not present"),

  PUBLIC_KEY: z.string().min(1, "PUBLIC_KEY is not present"),
  PRIVATE_KEY: z.string().min(1, "PRIVATE_KEY is not present"),

  ENCRYPTION_KEY: z.string().min(1, "ENCRYPTION_KEY is not present"),
  CLIENT_ENCRYPTION_KEY: z.string().min(1, "CLIENT_ENCRYPTION_KEY is not present"),
  COOKIE_SECRET: z.string().min(1, "COOKIE_SECRET is not present"),

  APP_URL: z.string().min(1, "APP_URL is not present").url("APP_URL is not a valid URL"),
  PORT: z.string().optional().default("4001"),
  CUSTOMER_CORS_ORIGINS: z.string().optional().default(""),

  // Cookie domain. When set, cookies are scoped to this domain so all
  // *.hoizr.com surfaces share auth. Leave unset on preview deploys /
  // staging so the browser falls back to the request host.
  COOKIE_DOMAIN: z.string().optional(),

  SERVER_ENV: z.string().min(1, "SERVER_ENV is not present"),

  RAZORPAY_KEY_ID: z.string().min(1, "RAZORPAY_KEY_ID is not present"),
  RAZORPAY_KEY_SECRET: z.string().min(1, "RAZORPAY_KEY_SECRET is not present"),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1, "RAZORPAY_WEBHOOK_SECRET is not present"),

  // Shared secret for HMAC-authenticated internal service calls (main-server
  // → customer-server, e.g. issuing an offline ticket order). Optional at
  // boot; when unset the internal route rejects every call (fails closed).
  // Must match main-server's INTERNAL_SERVICE_SECRET in each environment.
  INTERNAL_SERVICE_SECRET: z.string().optional(),

  // Cloudinary credentials. Optional at this layer — hoizr-workers
  // writes the invoice PDFs; customer-server only re-signs short-lived
  // download URLs on demand for the "Download invoice" button. When the
  // credentials aren't present (e.g. local dev without invoice infra),
  // the resolver surfaces a clear error instead of crashing at boot.
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // Google OAuth web client ID. Used server-side to verify the ID token
  // returned by @react-oauth/google on hoizr-client. The same client ID
  // must be configured on the frontend (NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID).
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1, "GOOGLE_OAUTH_CLIENT_ID is not present"),

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
  META_INSTAGRAM_APP_ID: z.string().optional(),
  META_INSTAGRAM_APP_SECRET: z.string().optional(),
  META_INSTAGRAM_REDIRECT_URI: z.string().optional(),
  META_INSTAGRAM_STATE_SECRET: z.string().optional(),
  META_INSTAGRAM_TOKEN_KEY: z.string().optional(),
  META_INSTAGRAM_FRONTEND_RETURN: z.string().optional(),

  // Google Maps server-side key used by the address-autocomplete
  // queries on /me/profile. Optional — when unset, the resolver
  // surfaces a clear error so misconfigured environments fail loud
  // rather than 200-OKing with empty results.
  MAPS_API_KEY: z.string().optional(),
});

type TEnv = z.infer<typeof zodEnvSchema>;

export class EnvVars {
  private static envVars: TEnv | null = null;

  public static initialize(): void {
    if (!this.envVars) {
      try {
        this.envVars = zodEnvSchema.parse(process.env);
      } catch (error: any) {
        console.error("Environment Variables Error", {
          error: { message: error.errors ?? error.toString() },
        });
        process.exit(1);
      }
    }
  }

  public static get values(): TEnv {
    if (!this.envVars) {
      throw new Error(
        "Environment variables are not initialized. Please call EnvVars.initialize() at startup."
      );
    }
    return this.envVars;
  }
}

EnvVars.initialize();
