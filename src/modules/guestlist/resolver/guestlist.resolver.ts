import {
  Arg,
  Ctx,
  Mutation,
  Query,
  Resolver,
  UseMiddleware,
} from "type-graphql";
import { isCustomerAuthenticated } from "../../../middlewares/customer-auth";
import Context from "../../../types/context.type";
import {
  GuestlistJoinView,
  GuestlistTicketView,
  PublicGuestlistView,
  VenuePublicGuestlistView,
} from "../interfaces/guestlist.objects";
import { guestlistService } from "../service/guestlist.service";

@Resolver()
export class GuestlistResolver {
  /** Public guestlists shown on an event page (opt-in). No auth needed. */
  @Query(() => [PublicGuestlistView])
  async eventPublicGuestlists(
    @Arg("eventId") eventId: string
  ): Promise<PublicGuestlistView[]> {
    return guestlistService.getPublicGuestlists(eventId);
  }

  /** A host's public guestlists for upcoming events — for the host/venue
   *  detail page. No auth; gated on host onboarding inside the service. */
  @Query(() => [VenuePublicGuestlistView])
  async venuePublicGuestlists(
    @Arg("venueId") venueId: string
  ): Promise<VenuePublicGuestlistView[]> {
    return guestlistService.getVenuePublicGuestlists(venueId);
  }

  /** Join-link preview. Works logged-out; `alreadyJoined` needs a session. */
  @Query(() => GuestlistJoinView)
  async guestlistByCode(
    @Arg("code") code: string,
    @Ctx() ctx: Context
  ): Promise<GuestlistJoinView> {
    return guestlistService.getGuestlistByCode(code, ctx.customerId);
  }

  @Mutation(() => GuestlistTicketView)
  @UseMiddleware(isCustomerAuthenticated)
  async joinGuestlist(
    @Arg("code") code: string,
    @Ctx() ctx: Context
  ): Promise<GuestlistTicketView> {
    return guestlistService.joinGuestlist(code, ctx.customerId as string);
  }

  @Query(() => [GuestlistTicketView])
  @UseMiddleware(isCustomerAuthenticated)
  async myGuestlistTickets(
    @Ctx() ctx: Context
  ): Promise<GuestlistTicketView[]> {
    return guestlistService.getMyGuestlistEntries(ctx.customerId as string);
  }
}
