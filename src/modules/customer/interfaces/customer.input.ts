import {
  AddressInfoInput,
  Gender,
  Genre,
} from "@hoizr-technology/shared";
import { Field, InputType } from "type-graphql";

@InputType()
export class UpdateCustomerProfileInput {
  @Field(() => String, { nullable: true })
  firstName?: string;

  @Field(() => String, { nullable: true })
  lastName?: string;

  @Field(() => String, { nullable: true })
  email?: string;

  @Field(() => Date, { nullable: true })
  birthdate?: Date;

  @Field(() => Gender, { nullable: true })
  gender?: Gender;

  @Field(() => String, { nullable: true })
  city?: string;

  /**
   * Saved home address — optional. Drives event distance badges and
   * personalised sort. Pass `null` (after destructuring the field on
   * the client) to clear; omit to leave unchanged.
   */
  @Field(() => AddressInfoInput, { nullable: true })
  address?: AddressInfoInput;

  @Field(() => [Genre], { nullable: true })
  genrePreferences?: Genre[];

  @Field(() => Boolean, { nullable: true })
  emailMarketingOptIn?: boolean;

  @Field(() => Boolean, { nullable: true })
  smsMarketingOptIn?: boolean;

  @Field(() => Boolean, { nullable: true })
  whatsappMarketingOptIn?: boolean;

  @Field(() => Boolean, { nullable: true })
  pushNotificationMarketingOptIn?: boolean;

  @Field(() => String, { nullable: true })
  profilePic?: string;
}
