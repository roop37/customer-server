"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PayoutModel = exports.Payout = void 0;
const shared_1 = require("@hoizr-technology/shared");
Object.defineProperty(exports, "Payout", { enumerable: true, get: function () { return shared_1.Payout; } });
const typegoose_1 = require("@typegoose/typegoose");
/**
 * Payout model registration for customer-server. Used to look up a host's
 * GST eligibility (REGULAR / CASUAL → may collect ticket GST; others → not)
 * during cart pricing. Collection name must match main-server's so both
 * services read the same documents.
 */
const PayoutModel = (0, typegoose_1.getModelForClass)(shared_1.Payout, {
    schemaOptions: { timestamps: true, collection: "payouts" },
});
exports.PayoutModel = PayoutModel;
