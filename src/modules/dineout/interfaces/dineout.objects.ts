import { Field, Float, Int, ObjectType } from "type-graphql";
import { SwiggyConnectionStatus } from "@hoizr-technology/shared";

/**
 * Connection status surfaced to the client. Deliberately carries NO token,
 * user id, or PII — just whether the customer is connected and until when,
 * so the UI can prompt reconnect ahead of expiry. `status` uses the
 * GraphQL-registered SwiggyConnectionStatus enum (CONNECTED/EXPIRED/REVOKED).
 */
@ObjectType()
export class SwiggyDineoutStatusResponse {
  @Field()
  connected!: boolean;

  @Field(() => SwiggyConnectionStatus, { nullable: true })
  status?: SwiggyConnectionStatus;

  @Field({ nullable: true })
  expiresAt?: Date;
}

/**
 * Every dineout result carries `needsSwiggyAuth` so the client can prompt a
 * reconnect instead of showing a hard error when the token is missing/expired
 * or Swiggy returns 401/419 (spec §5.3). `error` is a human-readable message
 * for other failures; the payload field is null in both cases.
 */

@ObjectType()
export class DineoutRestaurant {
  @Field()
  restaurantId!: string;

  @Field({ nullable: true })
  name?: string;

  @Field(() => [String])
  cuisines!: string[];

  @Field(() => Float, { nullable: true })
  rating?: number;

  @Field(() => Int, { nullable: true })
  ratingCount?: number;

  @Field({ nullable: true })
  costForTwo?: string;

  @Field({ nullable: true })
  distance?: string;

  @Field({ nullable: true })
  address?: string;

  @Field(() => [String])
  highlights!: string[];

  @Field(() => [String])
  offers!: string[];

  @Field({ nullable: true })
  source?: string;

  // Present on get_restaurant_details only (search is text-only, no images).
  @Field({ nullable: true })
  imageUrl?: string;

  @Field(() => [String])
  mastheadImages!: string[];
}

@ObjectType()
export class DineoutDeal {
  @Field({ nullable: true })
  title?: string;

  @Field({ nullable: true })
  itemId?: string;

  // slotId lives on the deal in the live API; book_table needs the pair.
  @Field(() => Int, { nullable: true })
  slotId?: number;

  @Field(() => Float, { nullable: true })
  bookingPrice?: number;

  @Field({ nullable: true })
  displayFee?: string;

  @Field(() => Float, { nullable: true })
  discountPercentage?: number;

  @Field()
  isFree!: boolean;
}

@ObjectType()
export class DineoutSlot {
  @Field(() => Int)
  slotId!: number;

  @Field(() => Float, { nullable: true })
  reservationTime?: number; // epoch seconds

  @Field({ nullable: true })
  itemId?: string;

  @Field({ nullable: true })
  displayTime?: string;

  @Field(() => [DineoutDeal])
  deals!: DineoutDeal[];
}

@ObjectType()
export class DineoutSlotGroup {
  @Field()
  name!: string; // Breakfast | Lunch | Dinner | ...

  @Field(() => [DineoutSlot])
  slots!: DineoutSlot[];
}

@ObjectType()
export class DineoutSavedLocation {
  @Field()
  id!: string;

  @Field({ nullable: true })
  addressLine?: string;

  @Field(() => Float, { nullable: true })
  latitude?: number;

  @Field(() => Float, { nullable: true })
  longitude?: number;
}

@ObjectType()
export class DineoutBookingConfirmation {
  @Field()
  orderId!: string;

  @Field({ nullable: true })
  restaurantName?: string;

  @Field({ nullable: true })
  restaurantAddress?: string;

  @Field(() => Float, { nullable: true })
  reservationTime?: number;

  @Field(() => Int, { nullable: true })
  guestCount?: number;

  @Field({ nullable: true })
  dealTitle?: string;

  @Field({ nullable: true })
  status?: string;
}

/** A persisted Hoizr-side booking record (My Reservations). */
@ObjectType()
export class DineoutBookingRecord {
  @Field()
  swiggyOrderId!: string;

  @Field()
  restaurantName!: string;

  @Field({ nullable: true })
  restaurantAddress?: string;

  @Field()
  reservationTime!: Date;

  @Field(() => Int)
  guestCount!: number;

  @Field()
  status!: string;

  @Field({ nullable: true })
  createdAt?: Date;
}

// ── Result envelopes (needsSwiggyAuth + nullable payload + nullable error) ──

@ObjectType()
export class DineoutSearchResult {
  @Field()
  needsSwiggyAuth!: boolean;

  @Field({ nullable: true })
  error?: string;

  @Field(() => [DineoutRestaurant])
  restaurants!: DineoutRestaurant[];
}

@ObjectType()
export class DineoutDetailsResult {
  @Field()
  needsSwiggyAuth!: boolean;

  @Field({ nullable: true })
  error?: string;

  @Field(() => DineoutRestaurant, { nullable: true })
  restaurant?: DineoutRestaurant;
}

@ObjectType()
export class DineoutSlotsResult {
  @Field()
  needsSwiggyAuth!: boolean;

  @Field({ nullable: true })
  error?: string;

  @Field(() => [DineoutSlotGroup])
  slotGroups!: DineoutSlotGroup[];
}

@ObjectType()
export class DineoutSavedLocationsResult {
  @Field()
  needsSwiggyAuth!: boolean;

  @Field({ nullable: true })
  error?: string;

  @Field(() => [DineoutSavedLocation])
  locations!: DineoutSavedLocation[];
}

@ObjectType()
export class DineoutBookingResult {
  @Field()
  needsSwiggyAuth!: boolean;

  @Field({ nullable: true })
  error?: string;

  // True when book_table failed ambiguously (5xx/timeout) and we could not
  // confirm — the client should poll status / offer support, NOT re-book.
  @Field()
  confirming!: boolean;

  @Field(() => DineoutBookingConfirmation, { nullable: true })
  booking?: DineoutBookingConfirmation;
}

@ObjectType()
export class DineoutBookingStatusResult {
  @Field()
  needsSwiggyAuth!: boolean;

  @Field({ nullable: true })
  error?: string;

  @Field(() => DineoutBookingConfirmation, { nullable: true })
  booking?: DineoutBookingConfirmation;
}

@ObjectType()
export class DineoutTonightRailResult {
  @Field()
  needsSwiggyAuth!: boolean;

  @Field({ nullable: true })
  error?: string;

  @Field(() => [DineoutRestaurant])
  restaurants!: DineoutRestaurant[];
}

@ObjectType()
export class ReportDineoutErrorResult {
  @Field()
  needsSwiggyAuth!: boolean;

  @Field({ nullable: true })
  error?: string;

  // report_error returns a pre-filled mailto: link the client can surface.
  @Field({ nullable: true })
  reportLink?: string;

  @Field({ nullable: true })
  message?: string;
}
