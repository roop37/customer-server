import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { makeExecutableSchema } from "@graphql-tools/schema";
import dotenv from "dotenv";
import "dotenv/config";
import Fastify from "fastify";
import mercurius, { ErrorWithProps, MercuriusError } from "mercurius";
import "reflect-metadata";
import { buildTypeDefsAndResolvers } from "type-graphql";
import { logger } from "./log/logger";
import { resolvers as typedResolvers } from "./resolvers/index.resolver";
import { registerInstagramOAuth } from "./routes/instagram-oauth.route";
import { registerInternalOfflineOrderRoute } from "./routes/internal-offline-order.route";
import { registerRazorpayWebhook } from "./routes/razorpay-webhook.route";
import Context from "./types/context.type";
import {
  CustomerCookieKeys,
  ScannerCookieKeys,
  readTokenFromRequest,
} from "./utils/cookie";
import { connectToMongoDb } from "./utils/dbConnection";
import { EnvVars } from "./utils/environment";
import { isProduction } from "./utils/helper";
import {
  verifyCustomerAccessToken,
  verifyScannerAccessToken,
} from "./utils/jwt";

dotenv.config();

// trustProxy so req.ip is the real client behind the LB/CDN — the per-IP OTP
// cap (auth.service) depends on it; without it every user shares the proxy IP
// and the cap locks out everyone at once. `true` trusts X-Forwarded-For (safe
// only if the LB strips inbound XFF). ponytail: set to the real hop count at
// deploy if the LB does NOT strip inbound XFF, else clients can spoof it. The
// per-phone + global OTP caps still bind regardless, so a spoofed IP only
// evades the per-IP layer — it can't drain the SMS budget.
const app = Fastify({ logger: false, trustProxy: true });

async function startServer() {
  try {
    await connectToMongoDb();

    const { typeDefs, resolvers } = await buildTypeDefsAndResolvers({
      resolvers: typedResolvers,
    });

    const schema = makeExecutableSchema({ typeDefs, resolvers });

    await app.register(import("fastify-raw-body"), {
      field: "rawBody",
      global: false,
      encoding: false,
      routes: ["/webhooks/razorpay", "/internal/offline-order/issue"],
    });

    app.addContentTypeParser(
      "application/x-www-form-urlencoded",
      { parseAs: "string" },
      (_request, body, done) => {
        try {
          done(
            null,
            Object.fromEntries(new URLSearchParams(String(body)))
          );
        } catch (error) {
          done(error as Error, undefined);
        }
      }
    );

    await app.register(helmet, { contentSecurityPolicy: isProduction });

    const configuredCorsOrigins = EnvVars.values.CUSTOMER_CORS_ORIGINS
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
    const allowedCorsOrigins = new Set([
      EnvVars.values.APP_URL,
      "https://www.hoizr.com",
      "https://hoizr.com",
      "https://dev.hoizr.com",
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3002",
      ...configuredCorsOrigins,
    ]);
    await app.register(cors, {
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowedCorsOrigins.has(origin)) return cb(null, true);
        try {
          const u = new URL(origin);
          if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
            return cb(null, true);
          }
        } catch {
          // fall through
        }
        logger.warn(`CORS reject: ${origin}`);
        cb(new Error("Origin not allowed"), false);
      },
      methods: ["GET", "POST", "OPTIONS"],
      credentials: true,
    });

    await app.register(cookie, {
      secret: EnvVars.values.COOKIE_SECRET,
      parseOptions: {},
    });

    app.register(mercurius, {
      schema,
      queryDepth: 7,
      graphiql: true,
      context: async (request, reply) => {
        const context: Context = {
          req: request,
          rep: reply,
          customerId: undefined,
          customerPhone: undefined,
          scannerId: undefined,
          scannerEventId: undefined,
          scannerBusinessId: undefined,
        };

        // The scanner app sends Authorization: Bearer <scannerJwt>. We try
        // scanner auth first because Flutter clients never send cookies;
        // if no scanner token, fall back to customer cookie/bearer auth.
        const scannerToken = readTokenFromRequest(
          request,
          ScannerCookieKeys.ACCESS_TOKEN
        );
        if (scannerToken) {
          const scanner = await verifyScannerAccessToken(scannerToken);
          if (scanner) {
            context.scannerId = scanner.scanner;
            context.scannerEventId = scanner.eventId;
            context.scannerBusinessId = scanner.businessId;
            return context;
          }
        }

        const accessToken = readTokenFromRequest(
          request,
          CustomerCookieKeys.ACCESS_TOKEN
        );

        if (accessToken) {
          const customer = await verifyCustomerAccessToken(accessToken);
          if (customer) {
            context.customerId = customer._id;
            context.customerPhone = customer.phone;
          }
        }

        return context;
      },
      errorFormatter: (result) => {
        const first = result.errors[0];
        const originalErr = first.originalError;
        const isUserFacing = originalErr instanceof ErrorWithProps;
        let message = "Something went wrong, please try again";
        let status = 200;

        if (isUserFacing) {
          const error = originalErr as MercuriusError & {
            code?: string;
            extensions?: Record<string, unknown>;
          };
          message = error.message ?? message;
          status = error.statusCode ?? 200;
          const code =
            (error.extensions?.code as string | undefined) ?? error.code;
          const extensions: Record<string, unknown> = { statusCode: status };
          if (code) extensions.code = code;

          return {
            statusCode: status,
            response: {
              data: null,
              errors: [{ message, extensions, ...(code ? { code } : {}) }],
            },
          };
        } else {
          // Internal error — log full detail so we can debug, but keep
          // the customer-facing message generic.
          logger.error(
            `GraphQL internal error at ${first.path?.join(".") ?? "?"}: ${
              originalErr?.message ?? first.message
            }\n${originalErr?.stack ?? first.stack ?? ""}`
          );
        }

        return {
          statusCode: status,
          response: { data: null, errors: [{ message }] },
        };
      },
    });

    registerRazorpayWebhook(app);
    registerInternalOfflineOrderRoute(app);
    registerInstagramOAuth(app);

    app.get("/", async (_req, res) => {
      res.status(200).send("Hoizr customer-server healthy");
    });

    app.setErrorHandler((error, _req, reply) => {
      reply.send(error);
    });

    const parsedPort = Number.parseInt(EnvVars.values.PORT, 10);
    const port = Number.isFinite(parsedPort) ? parsedPort : 4001;
    await app.listen({ port, host: "0.0.0.0" });
    logger.info(`Customer server started on http://localhost:${port} 🚀`);
  } catch (error: any) {
    console.error(error?.message ?? error);
  }
}

startServer();
