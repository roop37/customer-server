import { Field, ObjectType } from "type-graphql";
import { CartPricing } from "../../cart/interfaces/cart.objects";
import { CustomerOrderView } from "./order.view";

@ObjectType()
export class RazorpayCheckoutPayload {
  @Field(() => String)
  razorpayOrderId: string;

  @Field(() => String)
  razorpayKeyId: string;

  @Field(() => Number)
  amount: number;

  @Field(() => String)
  currency: string;

  @Field(() => String)
  orderId: string;
}

@ObjectType()
export class CreateOrderResponse {
  @Field(() => CustomerOrderView)
  order: CustomerOrderView;

  @Field(() => RazorpayCheckoutPayload, { nullable: true })
  checkout?: RazorpayCheckoutPayload;
}

@ObjectType()
export class OfflineLinkLine {
  @Field(() => String)
  itemId: string;

  @Field(() => String)
  name: string;

  @Field(() => Number)
  quantity: number;

  @Field(() => Number)
  unitPrice: number;

  @Field(() => Boolean)
  isExtra: boolean;
}

/** Prefill payload for a shared offline payment link (hoizr.com/t/<code>). */
@ObjectType()
export class OfflinePaymentLinkView {
  @Field(() => String)
  offlineOrderId: string;

  @Field(() => String)
  eventId: string;

  @Field(() => String, { nullable: true })
  eventTitle?: string;

  @Field(() => String, { nullable: true })
  eventFlyer?: string;

  @Field(() => String, { nullable: true })
  eventSlug?: string;

  @Field(() => [OfflineLinkLine])
  lines: OfflineLinkLine[];

  @Field(() => Number)
  amountTotal: number;

  @Field(() => String, { nullable: true })
  customerFirstName?: string;

  @Field(() => String, { nullable: true })
  customerLastName?: string;

  @Field(() => String, { nullable: true })
  customerEmail?: string;

  @Field(() => String)
  customerPhone: string;

  @Field(() => Boolean)
  alreadyPaid: boolean;

  @Field(() => Boolean)
  expired: boolean;
}

/**
 * Result of validating a promo code at checkout (previewCoupon query).
 * `ok=false` carries a human `reason`; `ok=true` carries the discount and
 * the grand-total before/after so the UI can show the savings line without
 * re-deriving the pricing math (which lives server-side).
 */
@ObjectType()
export class CouponPreviewView {
  @Field(() => Boolean)
  ok: boolean;

  @Field(() => String)
  code: string;

  /** Failure message when ok=false (e.g. "This coupon has expired"). */
  @Field(() => String, { nullable: true })
  reason?: string;

  /** Discount applied to the ticket subtotal, in rupees. */
  @Field(() => Number)
  discountAmount: number;

  /** Ticket subtotal BEFORE discount (gross), in rupees. */
  @Field(() => Number)
  ticketsSubtotal: number;

  /** Grand total without the coupon, in rupees. */
  @Field(() => Number)
  totalBefore: number;

  /** Grand total with the coupon applied, in rupees. */
  @Field(() => Number)
  totalAfter: number;

  /**
   * Full DISCOUNTED pricing breakdown (only when ok=true) so the checkout
   * UI renders exact GST/fee lines on the post-discount base — `grossAmount`
   * here is the net taxable, and `ticketsSubtotal − discountAmount` reconciles
   * to it. Null when the code is invalid.
   */
  @Field(() => CartPricing, { nullable: true })
  pricing?: CartPricing;
}

/**
 * A coupon the host chose to display publicly on the event page
 * (`showToCustomers`). Read-only marketing surface — customers copy the
 * `code` and apply it at checkout. Only active, in-window codes scoped to
 * this event (or host-global) are returned.
 */
@ObjectType()
export class PublicCoupon {
  @Field(() => String)
  code: string;

  @Field(() => String, { nullable: true })
  description?: string;

  /** Human discount label, e.g. "25% OFF (up to ₹200)", "₹100 OFF", "FREE". */
  @Field(() => String)
  discountLabel: string;

  /** Minimum cart value to use the code (₹), when set. */
  @Field(() => Number, { nullable: true })
  minCartValue?: number;

  @Field(() => Date)
  endDate: Date;
}

@ObjectType()
export class GuestCheckoutResponse {
  @Field(() => CustomerOrderView)
  order: CustomerOrderView;

  @Field(() => RazorpayCheckoutPayload, { nullable: true })
  checkout?: RazorpayCheckoutPayload;

  /** True when the phone/email matched an existing Hoizr account. */
  @Field(() => Boolean)
  accountFound: boolean;

  /** That account's email — so the client can show "we found your account
   *  (a***@x.com)" + the receipt goes to both this and the entered email. */
  @Field(() => String, { nullable: true })
  accountEmail?: string;

  /** True when a brand-new account was created AND the buyer was logged in
   *  (auth cookies set on the response). Existing accounts are never
   *  auto-logged-in — the client routes them to OTP login instead. */
  @Field(() => Boolean)
  loggedIn: boolean;
}

/**
 * Customer-facing invoice download payload. The signed URL is minted
 * fresh on every request (Cloudinary `private_download_url`) and is
 * short-lived — long enough for the browser to fetch the PDF, short
 * enough that a leaked link goes stale within minutes.
 */
@ObjectType()
export class CustomerOrderInvoice {
  @Field(() => String)
  invoiceNumber: string;

  @Field(() => String)
  pdfUrl: string;

  @Field(() => Date)
  expiresAt: Date;

  @Field(() => Date, { nullable: true })
  dateOfIssue?: Date;
}
