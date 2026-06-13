import { Arg, Query, Resolver } from "type-graphql";
import { PublicVenueFilterInput } from "../interfaces/venue.input";
import {
  PublicVenue,
  PublicVenuePaginatedResponse,
} from "../interfaces/venue.objects";
import PublicVenueService from "../service/venue.service";

@Resolver()
export class PublicVenueResolver {
  private readonly service = new PublicVenueService();

  @Query(() => PublicVenuePaginatedResponse)
  async getPublicVenues(
    @Arg("input", () => PublicVenueFilterInput, { nullable: true })
    input?: PublicVenueFilterInput
  ): Promise<PublicVenuePaginatedResponse> {
    return this.service.getPublicVenues(input ?? {});
  }

  @Query(() => PublicVenue, { nullable: true })
  async getPublicVenueById(
    @Arg("id", () => String) id: string
  ): Promise<PublicVenue | null> {
    return this.service.getPublicVenueById(id);
  }
}
