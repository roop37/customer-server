import {
  INTERNAL_SIG_HEADER,
  INTERNAL_TS_HEADER,
  verifyInternalRequest,
} from "@hoizr-technology/shared";
import type { FastifyInstance } from "fastify";
import { logger } from "../log/logger";
import OrderService from "../modules/order/service/order.service";
import { EnvVars } from "../utils/environment";

/**
 * Offline-ticket feature: internal, HMAC-authenticated endpoint that creates
 * the real scannable Order for a host-issued offline ticket. Only main-server
 * calls this (the host isn't a customer, so it brokers the call). Auth is the
 * shared-secret HMAC over the raw body + timestamp — no cookie/customer auth.
 */
export const registerInternalOfflineOrderRoute = (app: FastifyInstance) => {
  const orderService = new OrderService();

  app.post(
    "/internal/offline-order/issue",
    { config: { rawBody: true } },
    async (req, reply) => {
      const rawBody = (req as any).rawBody as Buffer | string | undefined;
      const raw =
        typeof rawBody === "string"
          ? rawBody
          : rawBody?.toString("utf8") ?? "";

      const ok = verifyInternalRequest({
        secret: EnvVars.values.INTERNAL_SERVICE_SECRET,
        rawBody: raw,
        timestamp: req.headers[INTERNAL_TS_HEADER] as string | undefined,
        signature: req.headers[INTERNAL_SIG_HEADER] as string | undefined,
      });
      if (!ok) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      let offlineOrderId: string | undefined;
      try {
        offlineOrderId = JSON.parse(raw)?.offlineOrderId;
      } catch {
        return reply.status(400).send({ error: "Invalid body" });
      }
      if (!offlineOrderId) {
        return reply.status(400).send({ error: "offlineOrderId required" });
      }

      try {
        const result = await orderService.createIssuedOfflineOrder(
          offlineOrderId
        );
        return reply.status(200).send(result);
      } catch (err: any) {
        logger.error({
          message: "internal offline-order issue failed",
          offlineOrderId,
          error: err?.message,
        });
        return reply
          .status(422)
          .send({ error: err?.message ?? "Failed to issue offline order" });
      }
    }
  );
};
