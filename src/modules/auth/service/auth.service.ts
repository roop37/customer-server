import { LifecycleEmailType, SignupProvider } from "@hoizr-technology/shared";
import { ErrorWithProps } from "mercurius";
import { nanoid } from "nanoid";
import { CustomerModel } from "../../customer/schema/customer.schema";
import OtpService from "../../otp/service/otp.service";
import { enqueueLifecycleEmail } from "../../../utils/lifecycle.queue";
import {
  checkRateLimit,
  incrementRateLimit,
  resetRateLimit,
} from "../../../utils/rateLimit";
import { normalizeCustomerPhone } from "../../../utils/validations";
import {
  createCustomerAuthTokens,
  storeCustomerRefreshToken,
} from "../../../utils/jwt";
import { CustomerAuthErrorCodes } from "../interfaces/auth.errors";
import {
  CustomerOtpRequestInput,
  CustomerOtpVerifyInput,
} from "../interfaces/auth.input";

class AuthService {
  private otp = new OtpService();

  async requestOtp(
    input: CustomerOtpRequestInput
  ): Promise<{ otpId: string; profileRequired: boolean }> {
    const normalized = normalizeCustomerPhone(input.phone);
    if (!normalized) {
      throw new ErrorWithProps("Invalid phone number");
    }
    const { raw, e164 } = normalized;

    // Rate limit OTP requests per phone — prevents abuse of the
    // DoubleTick/SMS budget and slows repeated account-status probes.
    // Key by E.164 so "9876543210" and "+919876543210" hit the same bucket.
    const rlKey = `customer_otp_request:${e164}`;
    if (!(await checkRateLimit(rlKey))) {
      throw new ErrorWithProps(
        "Too many OTP requests for this number. Try again later."
      );
    }
    await incrementRateLimit(rlKey);

    // Dual-lookup: match by either E.164 (post-backfill records) OR raw
    // input (pre-backfill records whose `phone` is still in legacy form).
    // Backfill script in internal-utility-scripts/ migrates everyone to
    // E.164 — once done, this can collapse to `phoneE164: e164`.
    const existing = await CustomerModel.findOne({
      $or: [{ phoneE164: e164 }, { phone: e164 }, { phone: raw }],
      isDeleted: false,
    })
      .select("_id")
      .lean();
    const otpId = await this.otp.generateOtp(e164, Boolean(existing));
    return { otpId, profileRequired: !existing };
  }

  async verifyOtp(input: CustomerOtpVerifyInput): Promise<{
    customerId: string;
    accessToken: string;
    refreshToken: string;
    uniqueId: string;
  }> {
    const normalized = normalizeCustomerPhone(input.phone);
    if (!normalized) {
      throw new ErrorWithProps("Invalid phone number");
    }
    const { raw, e164 } = normalized;

    // Rate limit verification attempts per phone — prevents OTP brute-force.
    const verifyRlKey = `customer_otp_verify:${e164}`;
    if (!(await checkRateLimit(verifyRlKey))) {
      throw new ErrorWithProps(
        "Too many failed verification attempts. Try again later."
      );
    }

    const result = await this.otp.validateOtp(e164, input.otpId, input.otp);
    if (!result.status) {
      // Only count failed verifications toward the lockout — successful
      // ones reset the counter so a legitimate user isn't penalised.
      await incrementRateLimit(verifyRlKey);
      throw new ErrorWithProps(result.message || "Invalid OTP");
    }
    await resetRateLimit(verifyRlKey);

    // Dual-lookup: same shape as requestOtp — covers pre- and post-backfill records.
    let customer = await CustomerModel.findOne({
      $or: [{ phoneE164: e164 }, { phone: e164 }, { phone: raw }],
      isDeleted: false,
    });
    let isNewCustomer = false;
    if (!customer) {
      const firstName = input.firstName?.trim();
      const lastName = input.lastName?.trim();
      const email = input.email?.trim().toLowerCase();

      if (!firstName || !lastName || !email) {
        throw new ErrorWithProps(
          "First name, last name, and email are required to create a new account.",
          { code: CustomerAuthErrorCodes.MISSING_REQUIRED_PROFILE_FIELDS }
        );
      }

      // Email-uniqueness guard. We enforce it at the schema level too,
      // but checking here lets us return a clean error instead of a
      // Mongo duplicate-key 500.
      const emailTaken = await CustomerModel.findOne({
        $or: [{ email }, { secondaryEmail: email }],
        isDeleted: false,
      })
        .select("_id")
        .lean();
      if (emailTaken) {
        throw new ErrorWithProps(
          "That email is already in use on another Hoizr account. Use a different email or sign in with Google.",
          { code: CustomerAuthErrorCodes.EMAIL_USED_ELSEWHERE }
        );
      }

      // New signups always store the E.164 form in both fields. `phone` is
      // kept in sync with `phoneE164` for the legacy callers (e.g. invoice
      // PDFs, ticket emails) that still read `phone` directly.
      customer = await CustomerModel.create({
        phone: e164,
        phoneE164: e164,
        firstName,
        lastName,
        email,
        signupProvider: SignupProvider.PHONE,
        authTokenVersion: 0,
      });
      isNewCustomer = true;
    } else if (!customer.phoneE164) {
      // Existing record from pre-D16 — opportunistically backfill phoneE164
      // when the customer next logs in. The standalone backfill script
      // covers customers who never log in again.
      customer.phoneE164 = e164;
      await customer.save();
    }

    // Welcome email only on customer creation, fire-and-forget via queue.
    if (isNewCustomer && customer.email) {
      enqueueLifecycleEmail(
        LifecycleEmailType.CUSTOMER_WELCOME,
        customer.email,
        [customer.firstName, customer.lastName].filter(Boolean).join(" ") ||
          undefined
      ).catch((_err: unknown) => {});
    }

    const uniqueId = nanoid();
    const { accessToken, refreshToken } = createCustomerAuthTokens({
      customer: customer._id.toString(),
      version: customer.authTokenVersion ?? 0,
      uniqueId,
    });

    await storeCustomerRefreshToken(customer._id.toString(), uniqueId, refreshToken);

    return {
      customerId: customer._id.toString(),
      accessToken,
      refreshToken,
      uniqueId,
    };
  }
}

export default AuthService;
