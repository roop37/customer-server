import { Field, InputType, Int } from "type-graphql";

@InputType()
export class MyOrdersFilterInput {
  @Field(() => Int, { nullable: true })
  page?: number;

  @Field(() => Int, { nullable: true })
  pageSize?: number;
}

@InputType()
export class UTMInput {
  @Field(() => String, { nullable: true })
  utmSource?: string;

  @Field(() => String, { nullable: true })
  utmMedium?: string;

  @Field(() => String, { nullable: true })
  utmCampaign?: string;

  @Field(() => String, { nullable: true })
  utmTerm?: string;

  @Field(() => String, { nullable: true })
  utmContent?: string;
}

@InputType()
export class GuestInfoInput {
  @Field(() => String, { nullable: true })
  firstName?: string;

  @Field(() => String, { nullable: true })
  lastName?: string;

  @Field(() => String, { nullable: true })
  email?: string;

  @Field(() => String)
  phone: string;
}

@InputType()
export class CreateOrderInput {
  @Field(() => String)
  eventId: string;

  @Field(() => GuestInfoInput, { nullable: true })
  guestInfo?: GuestInfoInput;

  @Field(() => UTMInput, { nullable: true })
  utm?: UTMInput;

  @Field(() => String, { nullable: true })
  pageQuery?: string;

  @Field(() => String, { nullable: true })
  referralCode?: string;

  @Field(() => String, { nullable: true })
  promoterId?: string;

  /** Promo/coupon code the customer applied at checkout. */
  @Field(() => String, { nullable: true })
  couponCode?: string;
}

@InputType()
export class GuestCartTicketInput {
  @Field(() => String)
  ticketId: string;

  @Field(() => Int)
  quantity: number;
}

/**
 * Validate a promo code against an event + the buyer's current ticket
 * selection and return a discount preview. Read-only: never mutates the
 * coupon or creates an order. Works for guest + logged-in buyers.
 */
@InputType()
export class PreviewCouponInput {
  @Field(() => String)
  eventId: string;

  @Field(() => String)
  couponCode: string;

  @Field(() => [GuestCartTicketInput])
  tickets: GuestCartTicketInput[];
}

@InputType()
export class GuestCartExtraInput {
  @Field(() => String)
  extraId: string;

  @Field(() => Int)
  quantity: number;
}

/**
 * Guest checkout: a not-logged-in buyer submits their selected tickets +
 * contact details together (the modal opened on "Continue to checkout").
 * The server resolves/creates a customer by phone, seeds the cart, and runs
 * the normal order flow.
 */
@InputType()
export class GuestOrderInput {
  @Field(() => String)
  eventId: string;

  @Field(() => [GuestCartTicketInput])
  tickets: GuestCartTicketInput[];

  @Field(() => [GuestCartExtraInput], { nullable: true })
  extras?: GuestCartExtraInput[];

  @Field(() => String)
  firstName: string;

  @Field(() => String)
  lastName: string;

  @Field(() => String)
  email: string;

  @Field(() => String)
  phone: string;

  /** "Notify me about events" — marketing opt-in; default true. */
  @Field(() => Boolean, { nullable: true })
  notifyMe?: boolean;

  /** Set when this guest order originates from a host's offline payment
   *  link — the created order links back to that OfflineOrder exactly. */
  @Field(() => String, { nullable: true })
  offlineOrderId?: string;

  @Field(() => UTMInput, { nullable: true })
  utm?: UTMInput;

  @Field(() => String, { nullable: true })
  pageQuery?: string;

  @Field(() => String, { nullable: true })
  referralCode?: string;

  @Field(() => String, { nullable: true })
  promoterId?: string;

  /** Promo/coupon code the guest applied at checkout. */
  @Field(() => String, { nullable: true })
  couponCode?: string;
}
