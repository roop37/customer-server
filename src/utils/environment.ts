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
  SERVER_URL: z.string().min(1, "SERVER_URL is not present").url("SERVER_URL is not a valid URL"),
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

  // Google OAuth web client ID. Used server-side to verify the ID token
  // returned by @react-oauth/google on hoizr-client. The same client ID
  // must be configured on the frontend (NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID).
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1, "GOOGLE_OAUTH_CLIENT_ID is not present"),
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
