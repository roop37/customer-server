import { QueueNames, formatForWhatsApp } from "@hoizr-technology/shared";
import { Queue } from "bullmq";
import { redisClient } from "./redis";

/**
 * Producer for the common/transactional WhatsApp queue (NOT campaigns).
 * The hoizr-workers primaryWhatsAppWorker consumes these and calls the
 * Meta Cloud API — or console-logs in dev / when keys are absent.
 *
 * Job shapes mirror the worker's union:
 *  - template: marketing-legal shape; OTP uses an AUTHENTICATION template.
 *  - text: only valid inside a 24h customer-initiated window.
 */
type PrimaryWhatsAppJob =
  | {
      kind: "template";
      toDigits: string;
      templateName: string;
      languageCode: string;
      components?: Record<string, unknown>[];
      meta?: Record<string, unknown>;
    }
  | { kind: "text"; toDigits: string; text: string; meta?: Record<string, unknown> };

export const primaryWhatsAppQueue = new Queue<PrimaryWhatsAppJob>(
  QueueNames.primaryWhatsappQueue,
  {
    connection: redisClient,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: true,
      removeOnFail: true,
    },
  }
);

// The Meta authentication template Hoizr uses for phone OTP. Override via
// env once the approved template name is known; default matches the
// seed-template naming convention.
const OTP_TEMPLATE = process.env.WHATSAPP_OTP_TEMPLATE_NAME ?? "hoizr_otp";
const OTP_TEMPLATE_LANG = process.env.WHATSAPP_OTP_TEMPLATE_LANG ?? "en";

/**
 * Enqueue a phone OTP over WhatsApp (primary channel). `phoneE164` is the
 * canonical `+91…` form; we format to digits-only for Meta. Returns false
 * (without throwing) if the phone can't be normalised, so the caller can
 * still rely on the SMS fallback.
 *
 * Meta authentication templates take the OTP as the body parameter and
 * (for a copy-code button) the same value as the button parameter.
 */
export const enqueueWhatsAppOtp = async (
  phoneE164: string,
  otp: string
): Promise<boolean> => {
  const toDigits = formatForWhatsApp(phoneE164);
  if (!toDigits) return false;

  await primaryWhatsAppQueue.add("CUSTOMER_OTP", {
    kind: "template",
    toDigits,
    templateName: OTP_TEMPLATE,
    languageCode: OTP_TEMPLATE_LANG,
    components: [
      { type: "body", parameters: [{ type: "text", text: otp }] },
      {
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: otp }],
      },
    ],
    meta: { purpose: "otp" },
  });
  return true;
};
