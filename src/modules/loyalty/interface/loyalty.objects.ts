import { Field, ObjectType } from "type-graphql";

/**
 * One coupon shown on a venue/host page. NEVER carries a points figure — the
 * customer only sees what they can get, not their balance. `kind` distinguishes
 * a publicly-typeable promo from a loyalty reward the customer qualifies for.
 */
@ObjectType()
export class VenueCouponView {
  @Field(() => String)
  kind: string; // "public" | "loyalty"

  /** Public coupon code (present for kind=public; loyalty codes are only minted on claim). */
  @Field(() => String, { nullable: true })
  code?: string;

  /** LoyaltyReward id to claim (present for kind=loyalty). */
  @Field(() => String, { nullable: true })
  rewardId?: string;

  @Field(() => String)
  title: string;

  /** Human discount summary, e.g. "20% OFF (up to ₹200)". */
  @Field(() => String)
  label: string;

  @Field(() => String, { nullable: true })
  description?: string;
}

@ObjectType()
export class VenueCouponsView {
  @Field(() => [VenueCouponView])
  public: VenueCouponView[];

  /** Loyalty coupons the signed-in customer currently qualifies for. Empty when
   *  signed-out or not yet eligible — no points number is ever exposed. */
  @Field(() => [VenueCouponView])
  loyalty: VenueCouponView[];
}

@ObjectType()
export class ClaimRewardResult {
  /** The personal, single-use coupon code minted for this customer. */
  @Field(() => String)
  code: string;

  @Field(() => Date)
  expiresAt: Date;
}
