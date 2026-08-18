import { LifecycleEmailType, customerPhoneForWhatsApp } from "@hoizr-technology/shared";
import { EnvVars } from "../../../utils/environment";
import { enqueueLifecycleEmail } from "../../../utils/lifecycle.queue";
import {
  primaryWhatsAppQueue,
  isWhatsAppLive,
} from "../../../utils/primary-whatsapp.queue";
import { CustomerModel } from "../../customer/schema/customer.schema";
import { logger } from "../../../log/logger";
import {
  buildReservationEmailData,
  ReservationNotifyInput,
} from "./reservation-message";

export { buildReservationEmailData } from "./reservation-message";
export type { ReservationNotifyInput } from "./reservation-message";

/**
 * Transactional reservation notifications (customer's OWN booking only —
 * order-tracking, never marketing, never to the restaurant). Uses the Hoizr
 * customer's own contact + our own transport. Behind SWIGGY_DINEOUT_REMINDERS_
 * ENABLED so it can ship dark until posture is confirmed.
 */

export const remindersEnabled = (): boolean =>
  EnvVars.values.SWIGGY_DINEOUT_REMINDERS_ENABLED === "true";

/**
 * Fetch the customer's own contact and fan the notification out to email
 * (always, if an email is on file) + WhatsApp (only when live AND a template
 * is configured — dormant otherwise). Best-effort: a comms failure must never
 * break the booking flow, so the caller does not await-throw on this.
 */
export const dispatchReservationNotification = async (
  input: ReservationNotifyInput & { customerId: string }
): Promise<void> => {
  if (!remindersEnabled()) return;
  const customer = await CustomerModel.findById(input.customerId)
    .select("email phone phoneE164 firstName lastName")
    .lean<{
      email?: string;
      phone?: string;
      phoneE164?: string;
      firstName?: string;
      lastName?: string;
    }>();
  if (!customer) return;

  const name =
    [customer.firstName, customer.lastName].filter(Boolean).join(" ") || undefined;
  const type =
    input.kind === "confirmed"
      ? LifecycleEmailType.CUSTOMER_DINEOUT_RESERVED
      : LifecycleEmailType.CUSTOMER_DINEOUT_REMINDER;
  const data = buildReservationEmailData(input);

  // Email — enqueueLifecycleEmail no-ops on empty `to`.
  if (customer.email) {
    await enqueueLifecycleEmail(type, customer.email, name, data).catch(
      (err: any) =>
        logger.error(`dineout notify email failed: ${err?.message ?? err}`)
    );
  }

  // WhatsApp — dormant unless live AND a template is configured (Meta-approved).
  const template =
    input.kind === "confirmed"
      ? EnvVars.values.WHATSAPP_DINEOUT_CONFIRM_TEMPLATE
      : EnvVars.values.WHATSAPP_DINEOUT_REMINDER_TEMPLATE;
  const toDigits = customerPhoneForWhatsApp(customer.phoneE164, customer.phone);
  if (isWhatsAppLive() && template && toDigits) {
    await primaryWhatsAppQueue
      .add("template", {
        kind: "template",
        toDigits,
        templateName: template,
        languageCode: "en",
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: input.restaurantName },
              { type: "text", text: String(data.whenLabel) },
              { type: "text", text: String(input.guestCount) },
            ],
          },
        ],
        meta: { area: "dineout", kind: input.kind },
      })
      .catch((err: any) =>
        logger.error(`dineout notify WA failed: ${err?.message ?? err}`)
      );
  }
};
