import { Field, ObjectType } from "type-graphql";
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
