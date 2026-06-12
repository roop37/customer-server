import { Field, Int, ObjectType } from "type-graphql";

@ObjectType()
export class CartTicketLine {
  @Field(() => String)
  ticketId: string;

  @Field(() => String)
  ticketName: string;

  @Field(() => Int)
  quantity: number;

  @Field(() => Number)
  unitPrice: number;

  @Field(() => Number)
  totalPrice: number;
}

@ObjectType()
export class CartExtraLine {
  @Field(() => String)
  extraId: string;

  @Field(() => String)
  extraName: string;

  @Field(() => Int)
  quantity: number;

  @Field(() => Number)
  unitPrice: number;

  @Field(() => Number)
  totalPrice: number;
}

@ObjectType()
export class CartPricing {
  /**
   * Ticket+extras TAXABLE base AFTER any coupon discount — i.e. the net base
   * that GST, the platform fee, and host commission are all computed on. With
   * no coupon this equals the gross ticket+extras subtotal (unchanged). The
   * pre-discount gross can be recovered as `grossAmount + discountAmount`.
   */
  @Field(() => Number)
  grossAmount: number;

  /** Coupon discount applied to the ticket subtotal (₹; 0 when none). */
  @Field(() => Number)
  discountAmount: number;

  @Field(() => Number)
  applicationFee: number;

  @Field(() => Number)
  applicationFeePercent: number;

  @Field(() => Number)
  platformFeeGst: number;

  @Field(() => Number)
  taxes: number;

  @Field(() => Number)
  taxesPercent: number;

  @Field(() => Number)
  totalAmount: number;
}

@ObjectType()
export class CartResponse {
  @Field(() => String)
  eventId: string;

  @Field(() => [CartTicketLine])
  tickets: CartTicketLine[];

  @Field(() => [CartExtraLine])
  extras: CartExtraLine[];

  @Field(() => CartPricing)
  pricing: CartPricing;

  @Field(() => Date)
  reservedAt: Date;

  @Field(() => Date)
  expiresAt: Date;
}
