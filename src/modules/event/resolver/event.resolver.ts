import { Event } from "@hoizr-technology/shared";
import { Arg, Query, Resolver } from "type-graphql";
import { PublicEventFilterInput } from "../interfaces/event.input";
import { PublicEventPaginatedResponse } from "../interfaces/event.objects";
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
}
