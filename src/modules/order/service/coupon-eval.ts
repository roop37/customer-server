import { PromoDiscountType } from "@hoizr-technology/shared";

/**
 * Pure coupon evaluator — given a Coupon doc + cart context, decides whether
 * the coupon is valid and how much (in paise) it discounts the TICKET subtotal.
 * No DB access: the caller supplies usage counts + first-order info so this
 * stays a deterministic, unit-testable function reused by both the checkout
 * apply path and a "preview discount" query.
 *
 * The returned `discountPaise` is the amount to take OFF the ticket taxable
 * BEFORE GST/fees (see HOIZR_FINANCE_SOURCE_OF_TRUTH.md → Coupon discount).
 */
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export type CouponEvalLine = { ticketId?: string; grossPaise: number };

export type CouponEvalContext = {
  ticketLines: CouponEvalLine[];
  now?: Date;
  /** coupon.usage.length — total redemptions so far. */
  totalUsageCount?: number;
  /** this customer's prior redemptions of this coupon. */
  customerUsageCount?: number;
  /** for FirstSignedOrder coupons: is this the customer's first signed order? */
  isFirstSignedOrder?: boolean;
};

export type CouponEvalResult = {
  ok: boolean;
  discountPaise: number;
  reason?: string;
};

export const evaluateCoupon = (
  coupon: any,
  ctx: CouponEvalContext
): CouponEvalResult => {
  const now = ctx.now ?? new Date();
  const fail = (reason: string): CouponEvalResult => ({
    ok: false,
    discountPaise: 0,
    reason,
  });

  if (!coupon) return fail("Invalid coupon");
  if (!coupon.isActive) return fail("This coupon is not active");
  if (coupon.startDate && now < new Date(coupon.startDate))
    return fail("This coupon isn't active yet");
  if (coupon.endDate && now > new Date(coupon.endDate))
    return fail("This coupon has expired");

  const days: string[] = coupon.applicableDays ?? [];
  if (days.length > 0 && !days.includes(DAY_NAMES[now.getDay()]))
    return fail("This coupon isn't valid today");

  // Eligible base: ticket lines the coupon applies to (empty applicableTickets
  // ⇒ all tickets).
  const applicable: string[] = coupon.applicableTickets ?? [];
  const eligiblePaise = ctx.ticketLines.reduce((sum, l) => {
    if (
      applicable.length > 0 &&
      (!l.ticketId || !applicable.includes(l.ticketId))
    )
      return sum;
    return sum + Math.max(0, l.grossPaise);
  }, 0);
  if (eligiblePaise <= 0)
    return fail("This coupon doesn't apply to the selected tickets");

  const ticketsGrossPaise = ctx.ticketLines.reduce(
    (s, l) => s + Math.max(0, l.grossPaise),
    0
  );
  if (
    coupon.minCartValue != null &&
    ticketsGrossPaise < Math.round(Number(coupon.minCartValue) * 100)
  ) {
    return fail(
      `Add ₹${coupon.minCartValue} or more of tickets to use this coupon`
    );
  }

  if (coupon.maxUsage != null && (ctx.totalUsageCount ?? 0) >= coupon.maxUsage)
    return fail("This coupon has reached its usage limit");
  // Per-customer cap: BLANK defaults to 1 (one use per customer), NOT unlimited.
  // Applied here so existing coupons with no explicit cap also get the 1-use rule.
  const perCustomerCap = coupon.maxUsagePerCustomer ?? 1;
  if ((ctx.customerUsageCount ?? 0) >= perCustomerCap)
    return fail("You've already used this coupon the maximum number of times");
  if (
    coupon.couponUsageSalesLimit != null &&
    Number(coupon.totalSalesUsed ?? 0) >= Number(coupon.couponUsageSalesLimit)
  )
    return fail("This coupon is no longer available");
  if (
    coupon.couponUsageType === "FirstSignedOrder" &&
    ctx.isFirstSignedOrder === false
  )
    return fail("This coupon is only for your first order");

  // Discount on the eligible base.
  let discountPaise = 0;
  const val = Number(coupon.discountValue ?? 0);
  switch (coupon.promoCodeDiscountType) {
    case PromoDiscountType.Percentage: {
      discountPaise = Math.round((eligiblePaise * val) / 100);
      if (coupon.uptoAmount != null) {
        discountPaise = Math.min(
          discountPaise,
          Math.round(Number(coupon.uptoAmount) * 100)
        );
      }
      break;
    }
    case PromoDiscountType.FixedAmount:
      discountPaise = Math.round(val * 100);
      break;
    case PromoDiscountType.Free:
      discountPaise = eligiblePaise;
      break;
    default:
      return fail("Unknown discount type");
  }
  discountPaise = Math.max(0, Math.min(discountPaise, eligiblePaise));
  if (discountPaise <= 0) return fail("This coupon gives no discount here");
  return { ok: true, discountPaise };
};
