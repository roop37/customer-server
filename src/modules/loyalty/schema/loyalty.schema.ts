import {
  Coupon,
  LoyaltyReward,
  LoyaltyTransaction,
  LoyaltyWallet,
} from "@hoizr-technology/shared";
import { getModelForClass } from "@typegoose/typegoose";

/**
 * Customer-server views of the loyalty collections. main-server writes wallets
 * (via workers) + rewards (host CRUD); customer-server READS wallets/rewards to
 * decide eligibility and WRITES a REDEEM transaction + a personal Coupon when a
 * customer claims a reward. Same collections throughout.
 */
export const LoyaltyWalletModel = getModelForClass(LoyaltyWallet, {
  schemaOptions: { timestamps: true, collection: "loyalty_wallets" },
});

export const LoyaltyRewardModel = getModelForClass(LoyaltyReward, {
  schemaOptions: { timestamps: true, collection: "loyalty_rewards" },
});

export const LoyaltyTransactionModel = getModelForClass(LoyaltyTransaction, {
  schemaOptions: { timestamps: true, collection: "loyalty_transactions" },
});

// Loyalty coupons are ordinary Coupon rows (origin: "loyalty"); reuse the same
// collection the checkout coupon path validates against.
export const LoyaltyCouponModel = getModelForClass(Coupon, {
  schemaOptions: { timestamps: true, collection: "coupons" },
});

export { Coupon, LoyaltyReward, LoyaltyTransaction, LoyaltyWallet };
