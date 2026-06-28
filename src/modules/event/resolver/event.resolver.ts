import { Event } from "@hoizr-technology/shared";
import { Arg, Query, Resolver } from "type-graphql";
import { PublicEventFilterInput } from "../interfaces/event.input";
import {
  PublicArtistOrOrganizerEvents,
  PublicEventPaginatedResponse,
  PublicEventPeopleResponse,
} from "../interfaces/event.objects";
import PublicEventService from "../service/event.service";

@Resolver()
export class PublicEventResolver {
  private readonly service = new PublicEventService();

  @Query(() => PublicEventPaginatedResponse)
  async getPublishedEvents(
    @Arg("input", () => PublicEventFilterInput, { nullable: true })
    input?: PublicEventFilterInput
  ): Promise<PublicEventPaginatedResponse> {
    return this.service.getPublishedEvents(input ?? {});
  }

  @Query(() => Event, { nullable: true })
  async getPublicEventBySlug(
    @Arg("slug", () => String) slug: string
  ): Promise<Event | null> {
    return this.service.getEventBySlug(slug);
  }

  @Query(() => Event, { nullable: true })
  async getPublicEventById(
    @Arg("id", () => String) id: string
  ): Promise<Event | null> {
    return this.service.getEventById(id);
  }

  @Query(() => PublicEventPeopleResponse)
  async getPublicEventPeople(
    @Arg("eventId", () => String) eventId: string
  ): Promise<PublicEventPeopleResponse> {
    return this.service.getEventPeople(eventId);
  }

  @Query(() => PublicArtistOrOrganizerEvents)
  async getArtistPastUpcomingEvents(
    @Arg("artistId", () => String) artistId: string
  ): Promise<PublicArtistOrOrganizerEvents> {
    return this.service.getArtistPastUpcomingEvents(artistId);
  }

  @Query(() => PublicArtistOrOrganizerEvents)
  async getOrganizerPastUpcomingEvents(
    @Arg("hostId", () => String) hostId: string
  ): Promise<PublicArtistOrOrganizerEvents> {
    return this.service.getOrganizerPastUpcomingEvents(hostId);
  }
}
