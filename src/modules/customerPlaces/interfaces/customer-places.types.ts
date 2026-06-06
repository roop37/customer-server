import { Field, Float, ObjectType } from "type-graphql";

@ObjectType("CustomerPlacePrediction")
export class CustomerPlacePrediction {
  @Field(() => String)
  placeId: string;

  @Field(() => String)
  displayName: string;
}

@ObjectType("CustomerPlaceDetail")
export class CustomerPlaceDetail {
  @Field(() => Float, { nullable: true })
  latitude?: number;

  @Field(() => Float, { nullable: true })
  longitude?: number;

  @Field(() => String, { nullable: true })
  addressLine1?: string;

  @Field(() => String, { nullable: true })
  addressLine2?: string;

  @Field(() => String, { nullable: true })
  city?: string;

  @Field(() => String, { nullable: true })
  state?: string;

  @Field(() => String, { nullable: true })
  pincode?: string;

  @Field(() => String, { nullable: true })
  formattedAddress?: string;
}
