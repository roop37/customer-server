import { Field, InputType, Int } from "type-graphql";

@InputType()
export class CreateArtistMerchOrderInput {
  @Field(() => String)
  merchId: string;

  @Field(() => Int)
  quantity: number;

  @Field(() => String, { nullable: true })
  shippingName?: string;

  @Field(() => String, { nullable: true })
  shippingPhone?: string;

  @Field(() => String, { nullable: true })
  shippingAddressLine1?: string;

  @Field(() => String, { nullable: true })
  shippingAddressLine2?: string;

  @Field(() => String, { nullable: true })
  shippingCity?: string;

  @Field(() => String, { nullable: true })
  shippingState?: string;

  @Field(() => String, { nullable: true })
  shippingPincode?: string;
}

@InputType()
export class ConfirmArtistMerchPaymentInput {
  @Field(() => String)
  razorpayOrderId: string;

  @Field(() => String)
  razorpayPaymentId: string;

  @Field(() => String)
  razorpaySignature: string;
}
