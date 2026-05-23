import { QueueNames } from "@hoizr-technology/shared";
import { Queue } from "bullmq";
import crypto from "crypto";
import type { FastifyInstance } from "fastify";
import { logger } from "../log/logger";
import { EnvVars } from "../utils/environment";
import { redisClient } from "../utils/redis";

let razorpayWebhookQueue: Queue | null = null;

const getQueue = (): Queue => {
  if (!razorpayWebhookQueue) {
    razorpayWebhookQueue = new Queue(QueueNames.razorpayWebhookQueue, {
      connection: redisClient,
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

const verifySignatureFastPath = (rawBody: string, signature: string): boolean => {
  const expected = crypto
    .createHmac("sha256", EnvVars.values.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(expected, "utf8"),
    Buffer.from(signature, "utf8")
  );
};

/**
 * Razorpay webhook receiver. We do the minimum work synchronously
 * (verify HMAC + enqueue) and return 200 immediately so the gateway
 * doesn't retry on slow downstream processing. The hoizr-workers
 * razorpay-webhook worker handles the order finalisation, QR generation,
 * post-purchase fan-out, and confirmation comms.
 */
export const registerRazorpayWebhook = (app: FastifyInstance) => {
  app.post(
    "/webhooks/razorpay",
    { config: { rawBody: true } },
    async (req, reply) => {
      const signature = req.headers["x-razorpay-signature"] as string | undefined;
      const rawBody = (req as any).rawBody as Buffer | string | undefined;

      if (!signature || !rawBody) {
        return reply.status(400).send({ error: "Missing signature or body" });
      }

      const bodyStr =
        typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");

      if (!verifySignatureFastPath(bodyStr, signature)) {
        logger.warn("Razorpay webhook signature mismatch");
        return reply.status(400).send({ error: "Invalid signature" });
      }

      try {
        await getQueue().add(
          "RAZORPAY_WEBHOOK",
          { rawBody: bodyStr, signature },
          { jobId: signature }
        );
        return reply.status(200).send({ received: true });
      } catch (err: any) {
        logger.error(
          `Razorpay webhook enqueue failed: ${err?.message ?? err}`
        );
        return reply.status(500).send({ error: "Internal error" });
      }
    }
  );
};
