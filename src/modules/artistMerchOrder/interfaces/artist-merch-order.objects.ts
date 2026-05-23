import { ArtistMerchOrder } from "@hoizr-technology/shared";
import { Field, Float, ObjectType } from "type-graphql";

@ObjectType()
export class ArtistMerchCheckoutPayload {
  @Field(() => String)
  razorpayOrderId: string;

  @Field(() => String)
  razorpayKeyId: string;

  @Field(() => Float)
  amount: number;

  @Field(() => String)
  currency: string;

  @Field(() => String)
  orderId: string;
}

@ObjectType()
export class CreateArtistMerchOrderResult {
  @Field(() => ArtistMerchOrder)
  order: ArtistMerchOrder;

  @Field(() => ArtistMerchCheckoutPayload)
  checkout: ArtistMerchCheckoutPayload;
}
