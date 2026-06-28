"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cookie_1 = __importDefault(require("@fastify/cookie"));
const cors_1 = __importDefault(require("@fastify/cors"));
const helmet_1 = __importDefault(require("@fastify/helmet"));
const schema_1 = require("@graphql-tools/schema");
const dotenv_1 = __importDefault(require("dotenv"));
require("dotenv/config");
const fastify_1 = __importDefault(require("fastify"));
const mercurius_1 = __importStar(require("mercurius"));
require("reflect-metadata");
const type_graphql_1 = require("type-graphql");
const logger_1 = require("./log/logger");
const index_resolver_1 = require("./resolvers/index.resolver");
const instagram_oauth_route_1 = require("./routes/instagram-oauth.route");
const internal_offline_order_route_1 = require("./routes/internal-offline-order.route");
const razorpay_webhook_route_1 = require("./routes/razorpay-webhook.route");
const cookie_2 = require("./utils/cookie");
const dbConnection_1 = require("./utils/dbConnection");
const environment_1 = require("./utils/environment");
const helper_1 = require("./utils/helper");
const jwt_1 = require("./utils/jwt");
dotenv_1.default.config();
const app = (0, fastify_1.default)({ logger: false });
async function startServer() {
    try {
        await (0, dbConnection_1.connectToMongoDb)();
        const { typeDefs, resolvers } = await (0, type_graphql_1.buildTypeDefsAndResolvers)({
            resolvers: index_resolver_1.resolvers,
        });
        const schema = (0, schema_1.makeExecutableSchema)({ typeDefs, resolvers });
        await app.register(Promise.resolve().then(() => __importStar(require("fastify-raw-body"))), {
            field: "rawBody",
            global: false,
            encoding: false,
            routes: ["/webhooks/razorpay", "/internal/offline-order/issue"],
        });
        app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_request, body, done) => {
            try {
                done(null, Object.fromEntries(new URLSearchParams(String(body))));
            }
            catch (error) {
                done(error, undefined);
            }
        });
        await app.register(helmet_1.default, { contentSecurityPolicy: helper_1.isProduction });
        const configuredCorsOrigins = environment_1.EnvVars.values.CUSTOMER_CORS_ORIGINS
            .split(",")
            .map((origin) => origin.trim())
            .filter(Boolean);
        const allowedCorsOrigins = new Set([
            environment_1.EnvVars.values.APP_URL,
            "https://www.hoizr.com",
            "https://hoizr.com",
            "https://dev.hoizr.com",
            "http://localhost:3000",
            "http://localhost:3001",
            "http://localhost:3002",
            ...configuredCorsOrigins,
        ]);
        await app.register(cors_1.default, {
            origin: (origin, cb) => {
                if (!origin)
                    return cb(null, true);
                if (allowedCorsOrigins.has(origin))
                    return cb(null, true);
                try {
                    const u = new URL(origin);
                    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
                        return cb(null, true);
                    }
                }
                catch {
                    // fall through
                }
                logger_1.logger.warn(`CORS reject: ${origin}`);
                cb(new Error("Origin not allowed"), false);
            },
            methods: ["GET", "POST", "OPTIONS"],
            credentials: true,
        });
        await app.register(cookie_1.default, {
            secret: environment_1.EnvVars.values.COOKIE_SECRET,
            parseOptions: {},
        });
        app.register(mercurius_1.default, {
            schema,
            queryDepth: 7,
            graphiql: true,
            context: async (request, reply) => {
                const context = {
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
                const scannerToken = (0, cookie_2.readTokenFromRequest)(request, cookie_2.ScannerCookieKeys.ACCESS_TOKEN);
                if (scannerToken) {
                    const scanner = await (0, jwt_1.verifyScannerAccessToken)(scannerToken);
                    if (scanner) {
                        context.scannerId = scanner.scanner;
                        context.scannerEventId = scanner.eventId;
                        context.scannerBusinessId = scanner.businessId;
                        return context;
                    }
                }
                const accessToken = (0, cookie_2.readTokenFromRequest)(request, cookie_2.CustomerCookieKeys.ACCESS_TOKEN);
                if (accessToken) {
                    const customer = await (0, jwt_1.verifyCustomerAccessToken)(accessToken);
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
                const isUserFacing = originalErr instanceof mercurius_1.ErrorWithProps;
                let message = "Something went wrong, please try again";
                let status = 200;
                if (isUserFacing) {
                    const error = originalErr;
                    message = error.message ?? message;
                    status = error.statusCode ?? 200;
                    const code = error.extensions?.code ?? error.code;
                    const extensions = { statusCode: status };
                    if (code)
                        extensions.code = code;
                    return {
                        statusCode: status,
                        response: {
                            data: null,
                            errors: [{ message, extensions, ...(code ? { code } : {}) }],
                        },
                    };
                }
                else {
                    // Internal error — log full detail so we can debug, but keep
                    // the customer-facing message generic.
                    logger_1.logger.error(`GraphQL internal error at ${first.path?.join(".") ?? "?"}: ${originalErr?.message ?? first.message}\n${originalErr?.stack ?? first.stack ?? ""}`);
                }
                return {
                    statusCode: status,
                    response: { data: null, errors: [{ message }] },
                };
            },
        });
        (0, razorpay_webhook_route_1.registerRazorpayWebhook)(app);
        (0, internal_offline_order_route_1.registerInternalOfflineOrderRoute)(app);
        (0, instagram_oauth_route_1.registerInstagramOAuth)(app);
        app.get("/", async (_req, res) => {
            res.status(200).send("Hoizr customer-server healthy");
        });
        app.setErrorHandler((error, _req, reply) => {
            reply.send(error);
        });
        const parsedPort = Number.parseInt(environment_1.EnvVars.values.PORT, 10);
        const port = Number.isFinite(parsedPort) ? parsedPort : 4001;
        await app.listen({ port, host: "0.0.0.0" });
        logger_1.logger.info(`Customer server started on http://localhost:${port} 🚀`);
    }
    catch (error) {
        console.error(error?.message ?? error);
    }
}
startServer();
