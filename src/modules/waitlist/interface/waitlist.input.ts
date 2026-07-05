import { Field, InputType, Int } from "type-graphql";

@InputType()
export class JoinWaitlistInput {
  @Field(() => String)
  eventId: string;

  @Field(() => Int, { nullable: true })
  partySize?: number;

  @Field(() => String, { nullable: true })
  note?: string;

  // Social handles supplied at join. When the event requires socials and Meta
  // verification is pending, Instagram must resolve (from here or the profile).
  // Any handle supplied here is also persisted to the customer profile.
  @Field(() => String, { nullable: true })
  instagramHandle?: string;

  @Field(() => String, { nullable: true })
  facebookHandle?: string;

  @Field(() => String, { nullable: true })
  xHandle?: string;
}
