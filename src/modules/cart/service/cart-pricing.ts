import { GstRegistrationType, TicketGST } from "@hoizr-technology/shared";
import { CartPricing } from "../interfaces/cart.objects";

/**
 * Locked pricing engine — implements HOIZR_FINANCE_SOURCE_OF_TRUTH.md §7.
 *
 * Key invariants:
 *   1. Hoizr platform fee + commission are computed on the ticket
 *      TAXABLE value, NOT on (taxable + ticket GST). Hoizr does not charge
 *      fees on the GST portion (govt money).
 *   2. Ticket GST is collected from the customer only when the host is
 *      GST-eligible (REGULAR or CASUAL_TAXABLE_PERSON). For all other
 *      hosts (UNREGISTERED, COMPOSITION) `ticketGstPaise` resolves to 0
 *      regardless of what the ticket type says.
 *   3. The customer-facing platform fee has its own GST (typically 18%)
 *      which Hoizr collects and remits to govt.
 *
 * Math is done on rupee values (pricing snapshots in this codebase store
 * money as rupees with 2-decimal precision via `+.toFixed(2)`). Future
 * refactor: migrate to integer paise + basis points per SoT §7.
 */

export type CartTicketRef = {
  ticketGST?: TicketGST | null;
  gstRate?: number | null;
};

export type CartLineForPricing = {
  ticketId?: string;
  quantity: number;
  unitPrice: number;
};

export type CartHostGstContext = {
  isGstRegistered?: boolean | null;
  gstin?: string | null;
  gstRegistrationType?: GstRegistrationType | string | null;
};

/**
 * Resolve the GST rate (as a percent) that applies to one ticket variant.
 * 18% for CGST_SGST_18 / IGST_18, 0% for ZERO / NONE / missing, and the
 * host-declared `gstRate` when the host picked OTHER.
 */
export const resolveGstRateForTicket = (ref: CartTicketRef): number => {
  switch (ref.ticketGST) {
    case TicketGST.CGST_SGST_18:
    case TicketGST.IGST_18:
      return 18;
    case TicketGST.OTHER:
      return Number(ref.gstRate ?? 0);
    case TicketGST.ZERO:
    case TicketGST.NONE:
    default:
      return 0;
  }
};

/**
 * Mirror of `canHostCollectTicketGst` in main-server. Duplicated here to
 * avoid pulling main-server code into customer-server.
 */
const canHostCollectTicketGst = (host?: CartHostGstContext | null): boolean => {
  if (!host) return false;
  if (!host.isGstRegistered) return false;
  if (!host.gstin) return false;
  const type = host.gstRegistrationType as GstRegistrationType | undefined;
  if (!type) return false;
  return (
    type === GstRegistrationType.REGULAR ||
    type === GstRegistrationType.CASUAL_TAXABLE_PERSON
  );
};

export type CartPricingInput = {
  ticketLines: CartLineForPricing[];
  extraLines: CartLineForPricing[];
  ticketRefs: Map<string, CartTicketRef>;
  /** Customer-side platform fee % (e.g. 5). */
  applicationFeePercent: number;
  /** GST on the platform fee (e.g. 18). Defaults to 18 if not provided. */
  applicationFeeGstPercent?: number;
  /**
   * Host GST eligibility snapshot. If null/missing or not REGULAR/CASUAL,
   * ticket GST is suppressed regardless of what individual tickets say.
   */
  host?: CartHostGstContext | null;
};

export const computeCartPricingForLines = (
  input: CartPricingInput
): CartPricing => {
  const ticketsGross = input.ticketLines.reduce(
    (sum, l) => sum + l.unitPrice * l.quantity,
    0
  );
  const extrasGross = input.extraLines.reduce(
    (sum, l) => sum + l.unitPrice * l.quantity,
    0
  );

  // Ticket TAXABLE value = sum of ticket face values + extras. This is
  // the base for BOTH the customer-facing platform fee AND the host-side
  // commission. Ticket GST sits ABOVE this and is pass-through to host.
  const ticketTaxableValue = +(ticketsGross + extrasGross).toFixed(2);

  // Ticket GST is only collected when the host is GST-eligible. For
  // ineligible hosts, the ticket face value is final and customer pays
  // no GST line.
  const eligibleForTicketGst = canHostCollectTicketGst(input.host);
  const taxes = eligibleForTicketGst
    ? +input.ticketLines
        .reduce((sum, l) => {
          if (!l.ticketId) return sum;
          const ref = input.ticketRefs.get(l.ticketId);
          if (!ref) return sum;
          const rate = resolveGstRateForTicket(ref);
          return sum + l.unitPrice * l.quantity * (rate / 100);
        }, 0)
        .toFixed(2)
    : 0;

  // Customer-facing platform fee on ticket taxable value (NOT on
  // taxable + ticket GST). Hoizr never charges fee on govt's GST.
  const applicationFee = +(
    ticketTaxableValue * (input.applicationFeePercent / 100)
  ).toFixed(2);

  // GST on Hoizr's own platform fee. Hoizr remits this to govt.
  const applicationFeeGstPercent = input.applicationFeeGstPercent ?? 18;
  const platformFeeGst = +(
    applicationFee * (applicationFeeGstPercent / 100)
  ).toFixed(2);

  const totalAmount = +(
    ticketTaxableValue +
    taxes +
    applicationFee +
    platformFeeGst
  ).toFixed(2);

  const taxesPercent =
    ticketTaxableValue > 0
      ? +((taxes / ticketTaxableValue) * 100).toFixed(2)
      : 0;

  return {
    grossAmount: ticketTaxableValue,
    applicationFee,
    applicationFeePercent: input.applicationFeePercent,
    platformFeeGst,
    taxes,
    taxesPercent,
    totalAmount,
  };
};
