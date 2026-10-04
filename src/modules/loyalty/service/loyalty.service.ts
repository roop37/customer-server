import {
  LoyaltyEntityType,
  LoyaltyTransactionType,
  PromoDiscountType,
} from "@hoizr-technology/shared";
import { mongoose } from "@typegoose/typegoose";
import { ErrorWithProps } from "mercurius";
import { customAlphabet } from "nanoid";
import { redisClient } from "../../../utils/redis";
import {
  LoyaltyCouponModel,
  LoyaltyRewardModel,
  LoyaltyTransactionModel,
  LoyaltyWalletModel,
} from "../schema/loyalty.schema";

// Unambiguous uppercase alphanumeric (no O/0/I/1) — matches the host coupon
// CODE_RE /^[A-Z0-9_-]{3,32}$/ so a claimed coupon validates like any promo.
const genSuffix = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);

/** Human discount summary for a coupon/template. Never exposes points. */
const discountLabel = (t: {
  discountType?: string;
  promoCodeDiscountType?: string;
  discountValue?: number;
  uptoAmount?: number;
}): string => {
  const type = t.discountType ?? t.promoCodeDiscountType;
  const upto = t.uptoAmount != null ? ` (up to ₹${Number(t.uptoAmount)})` : "";
  switch (type) {
    case PromoDiscountType.Percentage:
      return `${Number(t.discountValue ?? 0)}% OFF${upto}`;
    case PromoDiscountType.FixedAmount:
      return `₹${Number(t.discountValue ?? 0)} OFF`;
    case PromoDiscountType.Free:
      return "FREE";
    default:
      return "OFFER";
  }
};

class CustomerLoyaltyService {
  /**
   * Coupons to show on a venue/host page: the host's public promos, plus (only
   * when signed in AND eligible) the loyalty rewards this customer currently
   * qualifies for. The loyalty list is eligibility-filtered server-side and
   * carries NO points figure — the customer never sees a balance.
   */
  async venueCoupons(
    hostId: string,
    customerId?: string
  ): Promise<{ public: any[]; loyalty: any[] }> {
    if (!hostId) return { public: [], loyalty: [] };
    const now = new Date();

    // Public: host-level, customer-visible, in-window, NON-loyalty coupons.
    const publicCoupons = await LoyaltyCouponModel.find({
      host: String(hostId),
      showToCustomers: true,
      isActive: true,
      origin: { $ne: "loyalty" },
      startDate: { $lte: now },
      endDate: { $gte: now },
      $or: [
        { eventId: { $in: [null, ""] } },
        { eventId: { $exists: false } },
      ],
    })
      .sort({ createdAt: -1 })
      .lean<any[]>();

    const publicViews = publicCoupons.map((c) => ({
      kind: "public",
      code: c.code,
      title: c.description?.trim() || c.code,
      label: discountLabel(c),
      description: c.description,
    }));

    // Loyalty: only for a signed-in customer with a wallet + eligibility.
    let loyaltyViews: any[] = [];
    if (customerId) {
      const wallet = await LoyaltyWalletModel.findOne({
        customerId: String(customerId),
        entityType: LoyaltyEntityType.BUSINESS,
        entityId: String(hostId),
      })
        .select("balance")
        .lean<{ balance?: number }>();
      const balance = Number(wallet?.balance ?? 0);
      if (balance > 0) {
        const rewards = await LoyaltyRewardModel.find({
          hostId: String(hostId),
          active: true,
          pointsCost: { $lte: balance },
        })
          .sort({ pointsCost: 1 })
          .lean<any[]>();

        // Filter out sold-out + per-customer-exhausted rewards.
        const affordable = rewards.filter(
          (r) => r.totalStock == null || Number(r.redeemedCount ?? 0) < Number(r.totalStock)
        );
        const rewardIds = affordable.map((r) => String(r._id));
        const priorClaims = rewardIds.length
          ? await LoyaltyCouponModel.aggregate<{ _id: string; n: number }>([
              {
                $match: {
                  origin: "loyalty",
                  boundCustomerId: String(customerId),
                  loyaltyRewardId: { $in: rewardIds },
                },
              },
              { $group: { _id: "$loyaltyRewardId", n: { $sum: 1 } } },
            ])
          : [];
        const claimsById = new Map(
          priorClaims.map((c) => [String(c._id), Number(c.n)])
        );

        loyaltyViews = affordable
          .filter((r) => {
            const limit = r.perCustomerLimit;
            if (limit == null) return true;
            return (claimsById.get(String(r._id)) ?? 0) < Number(limit);
          })
          .map((r) => ({
            kind: "loyalty",
            rewardId: String(r._id),
            title: r.title,
            label: discountLabel(r.couponTemplate ?? {}),
            description: r.description,
          }));
      }
    }

    return { public: publicViews, loyalty: loyaltyViews };
  }

  /**
   * Spend points to claim a reward → mint a personal, single-use coupon bound to
   * this customer. Fully transactional: guarded balance decrement + REDEEM ledger
   * row + stock increment + Coupon create commit together, so a failed step never
   * leaves points spent without a coupon (or a coupon without the spend).
   */
  async claimReward(
    customerId: string,
    rewardId: string
  ): Promise<{ code: string; expiresAt: Date }> {
    if (!customerId) throw new ErrorWithProps("Please sign in to claim a reward");
    const reward = await LoyaltyRewardModel.findById(rewardId).lean<any>();
    if (!reward || reward.active === false) {
      throw new ErrorWithProps("This reward isn't available");
    }
    const hostId = String(reward.hostId);
    const pointsCost = Number(reward.pointsCost ?? 0);
    if (!(pointsCost > 0)) throw new ErrorWithProps("This reward isn't available");

    // Per-customer claim cap. This count is only race-safe because concurrent
    // claims of the same (customer, reward) are serialized by the Redis lock
    // below — MongoDB snapshot isolation alone would let two in-flight claims
    // both read 0 here. By the time a second claim runs, the first's coupon is
    // committed and counted.
    if (reward.perCustomerLimit != null) {
      const priorClaims = await LoyaltyCouponModel.countDocuments({
        origin: "loyalty",
        boundCustomerId: String(customerId),
        loyaltyRewardId: String(rewardId),
      });
      if (priorClaims >= Number(reward.perCustomerLimit)) {
        throw new ErrorWithProps("You've already claimed this reward");
      }
    }

    const tpl = reward.couponTemplate ?? {};
    const validityDays = Number(tpl.validityDays ?? 30);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);

    // Serialize concurrent claims of the SAME reward by the SAME customer with a
    // short Redis lock. MongoDB snapshot isolation can't enforce perCustomerLimit
    // across two in-flight transactions (each sees 0 prior claims), and a
    // double-submit (double-click / retry) would otherwise double-spend. The
    // lock closes both: a genuine repeat claim happens seconds later, past the TTL.
    const lockKey = `loyalty_claim_lock:${rewardId}:${customerId}`;
    const gotLock = await redisClient.set(lockKey, "1", "EX", 15, "NX");
    if (gotLock !== "OK") {
      throw new ErrorWithProps("You just claimed this — give it a moment.");
    }

    const session = await mongoose.startSession();
    let issuedCode = "";
    try {
      await session.withTransaction(async () => {
        // 1. Guarded spend — matched 0 ⇒ not enough points (aborts the txn).
        const debit = await LoyaltyWalletModel.updateOne(
          {
            customerId: String(customerId),
            entityType: LoyaltyEntityType.BUSINESS,
            entityId: hostId,
            balance: { $gte: pointsCost },
          },
          {
            $inc: { balance: -pointsCost },
            $set: { lastActivityAt: now },
          },
          { session }
        );
        if (debit.modifiedCount !== 1) {
          throw new ErrorWithProps("You don't have enough points for this reward");
        }

        // 2. Stock guard (only when a finite totalStock is set).
        if (reward.totalStock != null) {
          const stock = await LoyaltyRewardModel.updateOne(
            {
              _id: rewardId,
              $expr: { $lt: ["$redeemedCount", "$totalStock"] },
            },
            { $inc: { redeemedCount: 1 } },
            { session }
          );
          if (stock.modifiedCount !== 1) {
            throw new ErrorWithProps("This reward is out of stock");
          }
        } else {
          await LoyaltyRewardModel.updateOne(
            { _id: rewardId },
            { $inc: { redeemedCount: 1 } },
            { session }
          );
        }

        // 3. Mint the personal, single-use coupon (retry code on collision).
        let created: any = null;
        for (let attempt = 0; attempt < 3 && !created; attempt++) {
          const code = `LOYAL${genSuffix()}`;
          try {
            const docs = await LoyaltyCouponModel.create(
              [
                {
                  host: hostId,
                  code,
                  description: reward.title,
                  eventId: tpl.eventId,
                  origin: "loyalty",
                  boundCustomerId: String(customerId),
                  loyaltyRewardId: String(rewardId),
                  isActive: true,
                  showToCustomers: false,
                  startDate: now,
                  endDate: expiresAt,
                  promoCodeDiscountType: tpl.discountType,
                  discountValue: tpl.discountValue,
                  uptoAmount: tpl.uptoAmount,
                  minCartValue: tpl.minCartValue,
                  couponUsageType: "EntireSale",
                  maxUsagePerCustomer: 1,
                  maxUsage: 1,
                  applicableDays: [],
                  applicableTickets: [],
                  usage: [],
                  totalSalesUsed: 0,
                },
              ],
              { session }
            );
            created = docs[0];
            issuedCode = code;
          } catch (err: any) {
            if (err?.code === 11000) continue; // code clash → new code
            throw err;
          }
        }
        if (!created) {
          throw new ErrorWithProps("Couldn't generate a coupon code — try again");
        }

        // 4. REDEEM ledger row (negative points), idempotent on the coupon id.
        await LoyaltyTransactionModel.create(
          [
            {
              idempotencyKey: `redeem:${String(created._id)}`,
              customerId: String(customerId),
              entityType: LoyaltyEntityType.BUSINESS,
              entityId: hostId,
              source: "redeem",
              type: LoyaltyTransactionType.REDEEM,
              points: -pointsCost,
              amount: 0,
            },
          ],
          { session }
        );
      });
    } catch (err) {
      // Claim failed → free the lock immediately so the customer can retry.
      // (On success we intentionally let it expire, blocking an accidental
      // rapid re-claim of an unlimited reward.)
      await redisClient.del(lockKey).catch(() => {});
      throw err;
    } finally {
      await session.endSession();
    }

    return { code: issuedCode, expiresAt };
  }
}

export const customerLoyaltyService = new CustomerLoyaltyService();
export default CustomerLoyaltyService;
