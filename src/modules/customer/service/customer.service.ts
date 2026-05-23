import { ErrorWithProps } from "mercurius";
import { Customer, CustomerModel } from "../schema/customer.schema";
import { UpdateCustomerProfileInput } from "../interfaces/customer.input";

class CustomerService {
  async getMyProfile(customerId: string): Promise<Customer> {
    const customer = await CustomerModel.findById(customerId).lean<Customer>();
    if (!customer) throw new ErrorWithProps("Customer not found");
    return customer;
  }

  async updateMyProfile(
    customerId: string,
    input: UpdateCustomerProfileInput
  ): Promise<Customer> {
    const customer = await CustomerModel.findByIdAndUpdate(
      customerId,
      { $set: input },
      { new: true }
    ).lean<Customer>();

    if (!customer) throw new ErrorWithProps("Customer not found");
    return customer;
  }

  /**
   * Registers an FCM device token against the signed-in customer.
   * Uses $addToSet so re-registering the same token on the same
   * device is idempotent — repeated calls don't pile up duplicates.
   * Push opt-in is also flipped on so a host actually targeting
   * "push-subscribed customers" reaches this user.
   */
  async registerFcmToken(
    customerId: string,
    fcmToken: string
  ): Promise<boolean> {
    const trimmed = fcmToken?.trim();
    if (!trimmed) {
      throw new ErrorWithProps("FCM token is required");
    }
    // Cheap sanity bound — real FCM tokens are well over 100 chars.
    // Truncated junk should fail here, not at FCM dispatch time.
    if (trimmed.length < 40 || trimmed.length > 4096) {
      throw new ErrorWithProps("FCM token looks invalid");
    }
    const result = await CustomerModel.updateOne(
      { _id: customerId },
      {
        $addToSet: { fcmTokens: trimmed },
        $set: { pushNotificationMarketingOptIn: true },
      }
    );
    return result.acknowledged === true;
  }

  /**
   * Unregisters a token. Called on logout from the client app and
   * also by the worker when FCM reports a token as no-longer-valid
   * (registration-token-not-registered / invalid-argument).
   */
  async unregisterFcmToken(
    customerId: string,
    fcmToken: string
  ): Promise<boolean> {
    const trimmed = fcmToken?.trim();
    if (!trimmed) return false;
    const result = await CustomerModel.updateOne(
      { _id: customerId },
      { $pull: { fcmTokens: trimmed } }
    );
    return result.acknowledged === true;
  }
}

export default CustomerService;
