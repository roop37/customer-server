import { GuestlistEntryStatus } from "@hoizr-technology/shared";
import { Field, ObjectType } from "type-graphql";

/** What a customer sees on a guestlist join link before joining. */
@ObjectType()
export class GuestlistJoinView {
  @Field()
  guestlistId: string;

  @Field()
  code: string;

  @Field()
  eventId: string;

  @Field({ nullable: true })
  eventTitle?: string;

  @Field({ nullable: true })
  eventFlyer?: string;

  @Field({ nullable: true })
  eventDate?: string;

  @Field({ nullable: true })
  city?: string;

  @Field({ nullable: true })
  contributorName?: string;

  @Field()
  isPublic: boolean;

  /** Cap reached (no more spots). */
  @Field()
  isFull: boolean;

  /** This customer already has an entry on this list. */
  @Field()
  alreadyJoined: boolean;

  @Field(() => GuestlistEntryStatus, { nullable: true })
  myEntryStatus?: GuestlistEntryStatus;
}

/** A customer's golden ticket. */
@ObjectType()
export class GuestlistTicketView {
  @Field()
  entryId: string;

  @Field()
  eventId: string;

  @Field({ nullable: true })
  eventTitle?: string;

  @Field({ nullable: true })
  eventFlyer?: string;

  @Field({ nullable: true })
  eventDate?: string;

  @Field({ nullable: true })
  venue?: string;

  @Field({ nullable: true })
  contributorName?: string;

  @Field(() => GuestlistEntryStatus)
  status: GuestlistEntryStatus;

  /** Present only once ACCEPTED (the scannable golden-ticket payload). */
  @Field({ nullable: true })
  qrCodeData?: string;

  @Field()
  checkedIn: boolean;
}
