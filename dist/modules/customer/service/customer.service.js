"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mercurius_1 = require("mercurius");
const customer_schema_1 = require("../schema/customer.schema");
class CustomerService {
    async getMyProfile(customerId) {
        const customer = await customer_schema_1.CustomerModel.findById(customerId).lean();
        if (!customer)
            throw new mercurius_1.ErrorWithProps("Customer not found");
        return customer;
    }
    async updateMyProfile(customerId, input) {
        const customer = await customer_schema_1.CustomerModel.findByIdAndUpdate(customerId, { $set: input }, { new: true }).lean();
        if (!customer)
            throw new mercurius_1.ErrorWithProps("Customer not found");
        return customer;
    }
    /**
     * Registers an FCM device token against the signed-in customer.
     * Uses $addToSet so re-registering the same token on the same
     * device is idempotent — repeated calls don't pile up duplicates.
     * Push opt-in is also flipped on so a host actually targeting
     * "push-subscribed customers" reaches this user.
     */
    async registerFcmToken(customerId, fcmToken) {
        const trimmed = fcmToken?.trim();
        if (!trimmed) {
            throw new mercurius_1.ErrorWithProps("FCM token is required");
        }
        // Cheap sanity bound — real FCM tokens are well over 100 chars.
        // Truncated junk should fail here, not at FCM dispatch time.
        if (trimmed.length < 40 || trimmed.length > 4096) {
            throw new mercurius_1.ErrorWithProps("FCM token looks invalid");
        }
        const result = await customer_schema_1.CustomerModel.updateOne({ _id: customerId }, {
            $addToSet: { fcmTokens: trimmed },
            $set: { pushNotificationMarketingOptIn: true },
        });
        return result.acknowledged === true;
    }
    /**
     * Unregisters a token. Called on logout from the client app and
     * also by the worker when FCM reports a token as no-longer-valid
     * (registration-token-not-registered / invalid-argument).
     */
    async unregisterFcmToken(customerId, fcmToken) {
        const trimmed = fcmToken?.trim();
        if (!trimmed)
            return false;
        const result = await customer_schema_1.CustomerModel.updateOne({ _id: customerId }, { $pull: { fcmTokens: trimmed } });
        return result.acknowledged === true;
    }
}
exports.default = CustomerService;
