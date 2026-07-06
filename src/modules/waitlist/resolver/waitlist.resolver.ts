import { WaitlistEntry } from "@hoizr-technology/shared";
import { Arg, Ctx, Mutation, Query, Resolver, UseMiddleware } from "type-graphql";
import { isCustomerAuthenticated } from "../../../middlewares/customer-auth";
import Context from "../../../types/context.type";
import { JoinWaitlistInput } from "../interface/waitlist.input";
import WaitlistService from "../service/waitlist.service";

@Resolver()
export class WaitlistResolver {
  private readonly service = new WaitlistService();

  /** The signed-in customer's own waitlist entry for an event (or null). */
  @Query(() => WaitlistEntry, { nullable: true })
  @UseMiddleware(isCustomerAuthenticated)
  async myWaitlistStatus(
    @Ctx() ctx: Context,
    @Arg("eventId", () => String) eventId: string
  ): Promise<WaitlistEntry | null> {
    return this.service.myWaitlistStatus(
      ctx.customerId as string,
      eventId
    ) as any;
  }

  @Mutation(() => WaitlistEntry)
  @UseMiddleware(isCustomerAuthenticated)
  async joinWaitlist(
    @Ctx() ctx: Context,
    @Arg("input") input: JoinWaitlistInput
  ): Promise<WaitlistEntry> {
    return this.service.joinWaitlist(ctx.customerId as string, input) as any;
  }
}
