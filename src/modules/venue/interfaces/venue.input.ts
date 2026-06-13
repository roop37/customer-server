import { Field, InputType, Int } from "type-graphql";

@InputType()
export class PublicVenueFilterInput {
  /** Case-insensitive substring match on the venue name. */
  @Field(() => String, { nullable: true })
  search?: string;

  /** Filter by venue type label (exact, case-insensitive). */
  @Field(() => String, { nullable: true })
  venueType?: string;

  /** Filter by venue city (exact, case-insensitive on address.city). */
  @Field(() => String, { nullable: true })
  city?: string;

  @Field(() => Int, { nullable: true, defaultValue: 1 })
  page?: number;

  @Field(() => Int, { nullable: true, defaultValue: 20 })
  pageSize?: number;
}
