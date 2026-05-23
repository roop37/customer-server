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
    SERVER_URL: zod_1.z.string().min(1, "SERVER_URL is not present").url("SERVER_URL is not a valid URL"),
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
    // Google OAuth web client ID. Used server-side to verify the ID token
    // returned by @react-oauth/google on hoizr-client. The same client ID
    // must be configured on the frontend (NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID).
    GOOGLE_OAUTH_CLIENT_ID: zod_1.z.string().min(1, "GOOGLE_OAUTH_CLIENT_ID is not present"),
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
