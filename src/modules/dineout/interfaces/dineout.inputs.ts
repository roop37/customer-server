import { Field, Float, InputType, Int } from "type-graphql";

/**
 * Dineout GraphQL inputs. Coordinates are plain lat/lng here (already swapped
 * from Hoizr's GeoJSON [lng,lat] by the caller / venue deep-link via
 * toSearchCoords). entityType is a free string ("locality" | "CUISINE" |
 * "RESTAURANT_CATEGORY") — Swiggy's own casing, passed through as-is.
 */
@InputType()
export class DineoutSearchInput {
  @Field()
  query!: string;

  @Field({ nullable: true })
  entityType?: string;

  @Field({ nullable: true })
  addressId?: string;

  @Field(() => Float, { nullable: true })
  latitude?: number;

  @Field(() => Float, { nullable: true })
  longitude?: number;
}

@InputType()
export class DineoutRestaurantDetailsInput {
  @Field()
  restaurantId!: string;

  @Field(() => Float)
  latitude!: number;

  @Field(() => Float)
  longitude!: number;
}

@InputType()
export class DineoutSlotsInput {
  @Field()
  restaurantId!: string;

  @Field()
  date!: string; // YYYY-MM-DD (or epoch-as-string; passed through)

  @Field(() => Float)
  latitude!: number;

  @Field(() => Float)
  longitude!: number;
}

@InputType()
export class BookDineoutTableInput {
  @Field()
  restaurantId!: string;

  @Field(() => Int)
  slotId!: number;

  @Field()
  itemId!: string;

  @Field(() => Float)
  reservationTime!: number; // epoch seconds from the chosen slot

  @Field(() => Int)
  guestCount!: number; // 1-20

  @Field(() => Float)
  latitude!: number;

  @Field(() => Float)
  longitude!: number;

  // Faithful restaurant fields for the DineoutBooking record, carried from the
  // detail view so we don't need a second fetch to persist a readable record.
  @Field({ nullable: true })
  restaurantName?: string;

  @Field({ nullable: true })
  restaurantAddress?: string;
}

@InputType()
export class DineoutTonightRailInput {
  @Field()
  city!: string;

  @Field(() => Float)
  latitude!: number;

  @Field(() => Float)
  longitude!: number;
}

@InputType()
export class ReportDineoutErrorInput {
  @Field()
  tool!: string;

  @Field()
  errorMessage!: string;

  @Field({ nullable: true })
  flowDescription?: string;

  @Field({ nullable: true })
  userNotes?: string;
}
