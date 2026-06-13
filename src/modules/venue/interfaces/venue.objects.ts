import { AddressInfo } from "@hoizr-technology/shared";
import { Field, Int, ObjectType } from "type-graphql";

/**
 * Public-safe projection of a Host for the customer venues listing.
 * Deliberately narrow: only fields safe to expose to anonymous browsers
 * (no email/phone/GSTIN/owner linkage). Mirrors the slimmed shapes the
 * event module returns (e.g. PublicEventOrganizerEntry) rather than
 * leaking the full Host document.
 */
@ObjectType()
export class PublicVenue {
  @Field(() => String)
  _id: string;

  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => String, { nullable: true })
  logo?: string;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => String, { nullable: true })
  venueType?: string;

  @Field(() => AddressInfo, { nullable: true })
  address?: AddressInfo;

  @Field(() => String, { nullable: true })
  websiteUrl?: string;

  /** Up to 5 venue photos for the public venue page. */
  @Field(() => [String], { nullable: true })
  gallery?: string[];
}

@ObjectType()
export class PublicVenuePaginatedResponse {
  @Field(() => [PublicVenue])
  venues: PublicVenue[];

  @Field(() => Int)
  total: number;

  @Field(() => Int)
  page: number;

  @Field(() => Int)
  pageSize: number;
}
