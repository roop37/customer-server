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
} from "../interfaces/guestlist.objects";
import { guestlistService } from "../service/guestlist.service";

@Resolver()
export class GuestlistResolver {
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
