import { Arg, Ctx, Mutation, Query, Resolver, UseMiddleware } from "type-graphql";
import { isCustomerAuthenticated } from "../../../middlewares/customer-auth";
import Context from "../../../types/context.type";
import { SetCartInput } from "../interfaces/cart.input";
import { CartResponse } from "../interfaces/cart.objects";
import CartService from "../service/cart.service";

@Resolver()
export class CartResolver {
  private readonly service = new CartService();

  @Query(() => CartResponse, { nullable: true })
  @UseMiddleware(isCustomerAuthenticated)
  async getCart(
    @Ctx() ctx: Context,
    @Arg("eventId", () => String) eventId: string
  ): Promise<CartResponse | null> {
    return this.service.getCart(ctx.customerId as string, eventId);
  }

  @Mutation(() => CartResponse)
  @UseMiddleware(isCustomerAuthenticated)
  async setCart(
    @Ctx() ctx: Context,
    @Arg("input") input: SetCartInput
  ): Promise<CartResponse> {
    return this.service.setCart(ctx.customerId as string, input);
  }

  @Mutation(() => Boolean)
  @UseMiddleware(isCustomerAuthenticated)
  async clearCart(
    @Ctx() ctx: Context,
    @Arg("eventId", () => String) eventId: string
  ): Promise<boolean> {
    return this.service.clearCart(ctx.customerId as string, eventId);
  }
}
