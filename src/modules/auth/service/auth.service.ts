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
import { isValidPhone } from "../../../utils/validations";
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

  async requestOtp(input: CustomerOtpRequestInput): Promise<string> {
    const phone = input.phone.trim();
    if (!isValidPhone(phone)) {
      throw new ErrorWithProps("Invalid phone number");
    }

    // Rate limit OTP requests per phone — prevents abuse of the
    // DoubleTick/SMS budget and blocks brute-force enumeration of
    // existing customers via the requestOtp response.
    const rlKey = `customer_otp_request:${phone}`;
    if (!(await checkRateLimit(rlKey))) {
      throw new ErrorWithProps(
        "Too many OTP requests for this number. Try again later."
      );
    }
    await incrementRateLimit(rlKey);

    const existing = await CustomerModel.findOne({ phone }).select("_id").lean();
    return this.otp.generateOtp(phone, Boolean(existing));
  }

  async verifyOtp(input: CustomerOtpVerifyInput): Promise<{
    customerId: string;
    accessToken: string;
    refreshToken: string;
    uniqueId: string;
  }> {
    const phone = input.phone.trim();
    if (!isValidPhone(phone)) {
      throw new ErrorWithProps("Invalid phone number");
    }

    // Rate limit verification attempts per phone — prevents OTP brute-force.
    const verifyRlKey = `customer_otp_verify:${phone}`;
    if (!(await checkRateLimit(verifyRlKey))) {
      throw new ErrorWithProps(
        "Too many failed verification attempts. Try again later."
      );
    }

    const result = await this.otp.validateOtp(phone, input.otpId, input.otp);
    if (!result.status) {
      // Only count failed verifications toward the lockout — successful
      // ones reset the counter so a legitimate user isn't penalised.
      await incrementRateLimit(verifyRlKey);
      throw new ErrorWithProps(result.message || "Invalid OTP");
    }
    await resetRateLimit(verifyRlKey);

    let customer = await CustomerModel.findOne({ phone, isDeleted: false });
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

      customer = await CustomerModel.create({
        phone,
        firstName,
        lastName,
        email,
        signupProvider: SignupProvider.PHONE,
        authTokenVersion: 0,
      });
      isNewCustomer = true;
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
