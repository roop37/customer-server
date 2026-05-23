"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRazorpayWebhook = void 0;
const shared_1 = require("@hoizr-technology/shared");
const bullmq_1 = require("bullmq");
const crypto_1 = __importDefault(require("crypto"));
const logger_1 = require("../log/logger");
const environment_1 = require("../utils/environment");
const redis_1 = require("../utils/redis");
let razorpayWebhookQueue = null;
const getQueue = () => {
    if (!razorpayWebhookQueue) {
        razorpayWebhookQueue = new bullmq_1.Queue(shared_1.QueueNames.razorpayWebhookQueue, {
            connection: redis_1.redisClient,
            defaultJobOptions: {
                attempts: 5,
                backoff: { type: "exponential", delay: 5000 },
                removeOnComplete: true,
                removeOnFail: 100,
            },
        });
    }
    return razorpayWebhookQueue;
};
const verifySignatureFastPath = (rawBody, signature) => {
    const expected = crypto_1.default
        .createHmac("sha256", environment_1.EnvVars.values.RAZORPAY_WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");
    if (expected.length !== signature.length)
        return false;
    return crypto_1.default.timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(signature, "utf8"));
};
/**
 * Razorpay webhook receiver. We do the minimum work synchronously
 * (verify HMAC + enqueue) and return 200 immediately so the gateway
 * doesn't retry on slow downstream processing. The hoizr-workers
 * razorpay-webhook worker handles the order finalisation, QR generation,
 * post-purchase fan-out, and confirmation comms.
 */
const registerRazorpayWebhook = (app) => {
    app.post("/webhooks/razorpay", { config: { rawBody: true } }, async (req, reply) => {
        const signature = req.headers["x-razorpay-signature"];
        const rawBody = req.rawBody;
        if (!signature || !rawBody) {
            return reply.status(400).send({ error: "Missing signature or body" });
        }
        const bodyStr = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
        if (!verifySignatureFastPath(bodyStr, signature)) {
            logger_1.logger.warn("Razorpay webhook signature mismatch");
            return reply.status(400).send({ error: "Invalid signature" });
        }
        try {
            await getQueue().add("RAZORPAY_WEBHOOK", { rawBody: bodyStr, signature }, { jobId: signature });
            return reply.status(200).send({ received: true });
        }
        catch (err) {
            logger_1.logger.error(`Razorpay webhook enqueue failed: ${err?.message ?? err}`);
            return reply.status(500).send({ error: "Internal error" });
        }
    });
};
exports.registerRazorpayWebhook = registerRazorpayWebhook;
