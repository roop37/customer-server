import { Event } from "@hoizr-technology/shared";
import { Field, Int, ObjectType } from "type-graphql";

@ObjectType()
export class PublicEventPaginatedResponse {
  @Field(() => [Event])
  events: Event[];

  @Field(() => Int)
  total: number;

  @Field(() => Int)
  page: number;

  @Field(() => Int)
  pageSize: number;
}

/**
 * Lineup artist or phantom-artist record collapsed into a single shape
 * that the customer event page can render side by side. `isPhantom`
 * flags entries that exist only in the EventLineupArtist + PhantomArtist
 * collections (no public Artist account) — the UI uses it to decide
 * whether the card is clickable through to /artist/<slug>.
 */
@ObjectType()
export class PublicEventArtistEntry {
  @Field(() => String, { nullable: true })
  _id?: string;

  @Field(() => String)
  name: string;

  @Field(() => String, { nullable: true })
  picture?: string;

  @Field(() => String, { nullable: true })
  tagline?: string;

  @Field(() => String, { nullable: true })
  bio?: string;

  @Field(() => String, { nullable: true })
  slug?: string;

  @Field(() => String, { nullable: true })
  instagramLink?: string;

  @Field(() => String, { nullable: true })
  spotifyLink?: string;

  @Field(() => String, { nullable: true })
  youtubeLink?: string;

  @Field(() => Boolean)
  isPhantom: boolean;
}

/**
 * Event organizer (main host) + collaborators collapsed to one shape.
 * `isPrimary` is true exactly once per event (the host that owns the
 * event); the rest are collaborators ordered as they were added.
 */
@ObjectType()
export class PublicEventOrganizerEntry {
  @Field(() => String, { nullable: true })
  _id?: string;

  @Field(() => String)
  name: string;

  @Field(() => String, { nullable: true })
  logo?: string;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => String, { nullable: true })
  city?: string;

  @Field(() => Boolean)
  isPrimary: boolean;
}

@ObjectType()
export class PublicEventPeopleResponse {
  @Field(() => [PublicEventArtistEntry])
  artists: PublicEventArtistEntry[];

  @Field(() => [PublicEventOrganizerEntry])
  organizers: PublicEventOrganizerEntry[];
}
