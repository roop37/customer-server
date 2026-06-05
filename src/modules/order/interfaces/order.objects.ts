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
