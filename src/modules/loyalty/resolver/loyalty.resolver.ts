import { Arg, Ctx, Mutation, Query, Resolver, UseMiddleware } from "type-graphql";
import { isCustomerAuthenticated } from "../../../middlewares/customer-auth";
import Context from "../../../types/context.type";
import {
  ClaimRewardResult,
  VenueCouponsView,
} from "../interface/loyalty.objects";
import { customerLoyaltyService } from "../service/loyalty.service";

@Resolver()
export class CustomerLoyaltyResolver {
  /**
   * Coupons for a venue/host page: public promos + (signed-in only) the loyalty
   * rewards this customer qualifies for. No auth required — signed-out callers
   * get an empty loyalty list. No points figure is ever returned.
   */
  @Query(() => VenueCouponsView)
  async venueCoupons(
    @Arg("hostId") hostId: string,
    @Ctx() ctx: Context
  ): Promise<VenueCouponsView> {
    return customerLoyaltyService.venueCoupons(hostId, ctx.customerId) as any;
  }

  /** Spend points to claim a reward → returns a personal single-use coupon code. */
  @Mutation(() => ClaimRewardResult)
  @UseMiddleware([isCustomerAuthenticated])
  async claimLoyaltyReward(
    @Arg("rewardId") rewardId: string,
    @Ctx() ctx: Context
  ): Promise<ClaimRewardResult> {
    return customerLoyaltyService.claimReward(
      ctx.customerId ?? "",
      rewardId
    ) as any;
  }
}
