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
}
