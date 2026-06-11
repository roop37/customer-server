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
 * AUDIT-068: all arithmetic is done in INTEGER PAISE (no float `toFixed`
 * drift). Each percentage is applied to a paise integer and rounded to the
 * nearest paise — ticket GST is rounded per line, the way a real invoice
 * is — so the total is exact and `totalPaise === Σ component paise`. The
 * function still RETURNS rupee values (paise / 100) so the GraphQL contract
 * + the UI stay in rupees; the Razorpay boundary uses `Math.round(total *
 * 100)` which equals `totalPaise` exactly because total = totalPaise / 100.
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

// rupees → integer paise (nearest paise; handles any fractional input).
const toPaise = (rupees: number): number => Math.round(Number(rupees) * 100);
// integer paise → rupees, exact for a paise integer.
const toRupees = (paise: number): number => paise / 100;
// percentOf a paise integer, rounded to the nearest paise. `percent` may be
// fractional (e.g. an OTHER ticket gstRate); rounding per call mirrors how a
// real invoice rounds each line item.
const pctOfPaise = (paise: number, percent: number): number =>
  Math.round((paise * percent) / 100);

export const computeCartPricingForLines = (
  input: CartPricingInput
): CartPricing => {
  const ticketsGrossPaise = input.ticketLines.reduce(
    (sum, l) => sum + toPaise(l.unitPrice) * Math.max(0, Math.trunc(l.quantity)),
    0
  );
  const extrasGrossPaise = input.extraLines.reduce(
    (sum, l) => sum + toPaise(l.unitPrice) * Math.max(0, Math.trunc(l.quantity)),
    0
  );

  // Ticket TAXABLE value = sum of ticket face values + extras. Base for BOTH
  // the customer-facing platform fee AND the host-side commission. Ticket
  // GST sits ABOVE this and is pass-through to the host.
  const taxablePaise = ticketsGrossPaise + extrasGrossPaise;

  // Ticket GST only when the host is GST-eligible. Rounded PER LINE.
  const eligibleForTicketGst = canHostCollectTicketGst(input.host);
  const taxesPaise = eligibleForTicketGst
    ? input.ticketLines.reduce((sum, l) => {
        if (!l.ticketId) return sum;
        const ref = input.ticketRefs.get(l.ticketId);
        if (!ref) return sum;
        const rate = resolveGstRateForTicket(ref);
        const lineTaxablePaise =
          toPaise(l.unitPrice) * Math.max(0, Math.trunc(l.quantity));
        return sum + pctOfPaise(lineTaxablePaise, rate);
      }, 0)
    : 0;

  // Customer-facing platform fee on the ticket taxable value only (NOT on
  // taxable + ticket GST). Hoizr never charges a fee on govt's GST.
  const applicationFeePaise = pctOfPaise(
    taxablePaise,
    input.applicationFeePercent
  );

  // GST on Hoizr's own platform fee. Hoizr remits this to govt.
  const applicationFeeGstPercent = input.applicationFeeGstPercent ?? 18;
  const platformFeeGstPaise = pctOfPaise(
    applicationFeePaise,
    applicationFeeGstPercent
  );

  const totalPaise =
    taxablePaise + taxesPaise + applicationFeePaise + platformFeeGstPaise;

  const taxesPercent =
    taxablePaise > 0
      ? Math.round((taxesPaise / taxablePaise) * 10000) / 100
      : 0;

  // Reconciliation invariant (AUDIT-068): the total must equal the sum of
  // its parts to the exact paise, and the rupee total must map back to the
  // same paise the Razorpay boundary will charge. Integer math guarantees
  // both — this assert is a tripwire against a future refactor breaking it.
  const componentsPaise =
    taxablePaise + taxesPaise + applicationFeePaise + platformFeeGstPaise;
  const totalAmount = toRupees(totalPaise);
  if (
    componentsPaise !== totalPaise ||
    Math.round(totalAmount * 100) !== totalPaise
  ) {
    throw new Error(
      `Cart pricing reconciliation failed: components=${componentsPaise} total=${totalPaise} roundtrip=${Math.round(
        totalAmount * 100
      )}`
    );
  }

  return {
    grossAmount: toRupees(taxablePaise),
    applicationFee: toRupees(applicationFeePaise),
    applicationFeePercent: input.applicationFeePercent,
    platformFeeGst: toRupees(platformFeeGstPaise),
    taxes: toRupees(taxesPaise),
    taxesPercent,
    totalAmount,
  };
};
