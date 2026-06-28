import {
  Arg,
  Ctx,
  Int,
  Mutation,
  Query,
  Resolver,
  UseMiddleware,
} from "type-graphql";
import { isCustomerAuthenticated } from "../../../middlewares/customer-auth";
import Context from "../../../types/context.type";
import {
  ConnectInstagramInput,
  EventAttendeeWithInstagram,
  UpdateInstagramVisibilityInput,
} from "../interfaces/customer-instagram.input";
import { CustomerInstagram } from "../schema/customer-instagram.schema";
import CustomerInstagramService from "../service/customer-instagram.service";

@Resolver()
export class CustomerInstagramResolver {
  private readonly service = new CustomerInstagramService();

  @Query(() => CustomerInstagram, { nullable: true })
  @UseMiddleware(isCustomerAuthenticated)
  async getMyInstagram(
    @Ctx() ctx: Context
  ): Promise<CustomerInstagram | null> {
    return this.service.getMyInstagram(ctx.customerId as string);
  }

  @Mutation(() => CustomerInstagram)
  @UseMiddleware(isCustomerAuthenticated)
  async connectInstagram(
    @Ctx() ctx: Context,
    @Arg("input") input: ConnectInstagramInput
  ): Promise<CustomerInstagram> {
    return this.service.connectInstagram(
      ctx.customerId as string,
      input
    );
  }

  @Mutation(() => Boolean)
  @UseMiddleware(isCustomerAuthenticated)
  async disconnectInstagram(@Ctx() ctx: Context): Promise<boolean> {
    return this.service.disconnectInstagram(ctx.customerId as string);
  }

  @Mutation(() => CustomerInstagram)
  @UseMiddleware(isCustomerAuthenticated)
  async updateInstagramVisibility(
    @Ctx() ctx: Context,
    @Arg("input") input: UpdateInstagramVisibilityInput
  ): Promise<CustomerInstagram> {
    return this.service.updateAttendeeVisibility(
      ctx.customerId as string,
      input
    );
  }

  @Mutation(() => CustomerInstagram, { nullable: true })
  @UseMiddleware(isCustomerAuthenticated)
  async syncMyInstagram(
    @Ctx() ctx: Context
  ): Promise<CustomerInstagram | null> {
    return this.service.syncMyInstagram(ctx.customerId as string);
  }

  /**
   * Public — anyone can read the visible-attendee face row for an
   * event. Each customer in the row has explicitly opted in. The
   * `limit` argument caps payload size; the event detail page only
   * renders ~16 faces at a time.
   */
  @Query(() => [EventAttendeeWithInstagram])
  async getEventAttendeesWithInstagram(
    @Arg("eventId", () => String) eventId: string,
    @Arg("limit", () => Int, { nullable: true, defaultValue: 36 })
    limit: number
  ): Promise<EventAttendeeWithInstagram[]> {
    return this.service.getEventAttendeesWithInstagram(eventId, limit);
  }
}
