import { Customer } from "@hoizr-technology/shared";
import { Arg, Ctx, Mutation, Query, Resolver, UseMiddleware } from "type-graphql";
import { isCustomerAuthenticated } from "../../../middlewares/customer-auth";
import Context from "../../../types/context.type";
import { UpdateCustomerProfileInput } from "../interfaces/customer.input";
import CustomerService from "../service/customer.service";

@Resolver()
export class CustomerResolver {
  private readonly service = new CustomerService();

  @Query(() => Customer)
  @UseMiddleware(isCustomerAuthenticated)
  async getMyProfile(@Ctx() ctx: Context): Promise<Customer> {
    return this.service.getMyProfile(ctx.customerId as string);
  }

  @Mutation(() => Customer)
  @UseMiddleware(isCustomerAuthenticated)
  async updateMyProfile(
    @Ctx() ctx: Context,
    @Arg("input") input: UpdateCustomerProfileInput
  ): Promise<Customer> {
    return this.service.updateMyProfile(ctx.customerId as string, input);
  }

  /**
   * Hoizr mobile / web push clients call this after the user grants
   * notification permission and Firebase hands back a registration
   * token. Idempotent: registering the same token again is a no-op.
   */
  @Mutation(() => Boolean)
  @UseMiddleware(isCustomerAuthenticated)
  async registerFcmToken(
    @Ctx() ctx: Context,
    @Arg("fcmToken") fcmToken: string
  ): Promise<boolean> {
    return this.service.registerFcmToken(
      ctx.customerId as string,
      fcmToken
    );
  }

  /**
   * Removes a token — called on app logout or when a device is
   * unenrolled. The worker also calls into this path when FCM rejects
   * a token so we self-heal the customer record.
   */
  @Mutation(() => Boolean)
  @UseMiddleware(isCustomerAuthenticated)
  async unregisterFcmToken(
    @Ctx() ctx: Context,
    @Arg("fcmToken") fcmToken: string
  ): Promise<boolean> {
    return this.service.unregisterFcmToken(
      ctx.customerId as string,
      fcmToken
    );
  }
}
