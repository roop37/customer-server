import { Payout } from "@hoizr-technology/shared";
import { getModelForClass } from "@typegoose/typegoose";

/**
 * Payout model registration for customer-server. Used to look up a host's
 * GST eligibility (REGULAR / CASUAL → may collect ticket GST; others → not)
 * during cart pricing. Collection name must match main-server's so both
 * services read the same documents.
 */
const PayoutModel = getModelForClass(Payout, {
  schemaOptions: { timestamps: true, collection: "payouts" },
});

export { Payout, PayoutModel };
