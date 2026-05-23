import { LifecycleEmailType, SignupProvider } from "@hoizr-technology/shared";
import { ErrorWithProps } from "mercurius";
import { nanoid } from "nanoid";
import { CustomerModel } from "../../customer/schema/customer.schema";
import OtpService from "../../otp/service/otp.service";
import { enqueueLifecycleEmail } from "../../../utils/lifecycle.queue";
import { enqueueProfilePicMirror } from "../../../utils/profile-pic-mirror.queue";
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
  CustomerAppleStartInput,
  CustomerGoogleStartInput,
  CustomerPendingSignupRequestOtpInput,
  CustomerPendingSignupVerifyOtpInput,
} from "../interfaces/auth.input";
import {
  CustomerGoogleStartResponse,
  CustomerPendingSignupVerifyOtpResponse,
  GoogleStartOutcome,
  PendingSignupOutcome,
} from "../interfaces/auth.objects";
import {
  createPendingSignup,
  deletePendingSignup,
  readPendingSignup,
  updatePendingSignup,
} from "./pending-signup.store";
import { GoogleProfile, verifyGoogleIdToken } from "./oauth-verifier";

const issueTokensAndReturn = async (
  customerId: string,
  authTokenVersion: number
): Promise<{ accessToken: string; refreshToken: string; uniqueId: string }> => {
  const uniqueId = nanoid();
  const { accessToken, refreshToken } = createCustomerAuthTokens({
    customer: customerId,
    version: authTokenVersion ?? 0,
    uniqueId,
  });
  await storeCustomerRefreshToken(customerId, uniqueId, refreshToken);
  return { accessToken, refreshToken, uniqueId };
};

const maskEmail = (email?: string): string | undefined => {
  if (!email) return undefined;
  const [local, domain] = email.split("@");
  if (!domain) return email;
  if (local.length <= 2) return `${local[0] ?? ""}***@${domain}`;
  return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`;
};

class OAuthService {
  private otp = new OtpService();

  /**
   * Google sign-in start. Three outcomes:
   *   - LOGGED_IN: existing customer matched by googleData.id.
   *   - LINKED_EXISTING_BY_EMAIL: existing phone-OTP customer matched by
   *     primary or secondary email — Google was just linked on the spot.
   *   - PENDING_PHONE_REQUIRED: no matching account; client must complete
   *     phone-OTP via the pending-signup mutations.
   */
  async googleStart(
    input: CustomerGoogleStartInput
  ): Promise<CustomerGoogleStartResponse> {
    const profile = await verifyGoogleIdToken(input.idToken);

    // 1) Already-linked Google account → straight login.
    const existingByGoogle = await CustomerModel.findOne({
      "googleData.id": profile.id,
      isDeleted: false,
    });
    if (existingByGoogle) {
      const tokens = await issueTokensAndReturn(
        existingByGoogle._id.toString(),
        existingByGoogle.authTokenVersion ?? 0
      );
      return {
        outcome: GoogleStartOutcome.LOGGED_IN,
        customerId: existingByGoogle._id.toString(),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    }

    // 2) Existing account by email match (primary or secondary). Link
    //    Google now and issue tokens. Frontend shows a "we connected
    //    your Google sign-in to your existing account" modal so the
    //    customer knows what happened.
    const existingByEmail = await CustomerModel.findOne({
      $or: [{ email: profile.email }, { secondaryEmail: profile.email }],
      isDeleted: false,
    });
    if (existingByEmail) {
      this.applyGoogleLinkToCustomer(existingByEmail, profile);
      await existingByEmail.save();
      if (existingByEmail.profilePic === undefined && profile.picture) {
        await enqueueProfilePicMirror(
          existingByEmail._id.toString(),
          profile.picture
        );
      }
      const tokens = await issueTokensAndReturn(
        existingByEmail._id.toString(),
        existingByEmail.authTokenVersion ?? 0
      );
      return {
        outcome: GoogleStartOutcome.LINKED_EXISTING_BY_EMAIL,
        customerId: existingByEmail._id.toString(),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    }

    // 3) Brand-new — open a pending signup. Client collects + verifies
    //    phone OTP before the account is created.
    const pendingToken = await createPendingSignup({
      provider: "google",
      google: profile,
    });
    return {
      outcome: GoogleStartOutcome.PENDING_PHONE_REQUIRED,
      pendingToken,
      prefill: {
        email: profile.email,
        firstName: profile.givenName,
        lastName: profile.familyName,
        picture: profile.picture,
      },
    };
  }

  /**
   * Apple sign-in start. Stubbed until Apple Developer creds are wired —
   * see /docs/APPLE_SIGN_IN_ENABLEMENT.md for the enablement plan.
   * Throws a typed error the frontend uses to keep the button disabled.
   */
  async appleStart(_input: CustomerAppleStartInput): Promise<never> {
    throw new ErrorWithProps(
      "Sign in with Apple isn't enabled yet. Please use Google or phone OTP for now.",
      { code: CustomerAuthErrorCodes.APPLE_NOT_CONFIGURED }
    );
  }

  /**
   * Phase 2 of OAuth signup — collect + send OTP to the customer's
   * phone. Uses the same RingCentral/SMS path as the existing phone
   * login. Rate-limited per phone to keep OTP budget bounded.
   */
  async pendingSignupRequestOtp(
    input: CustomerPendingSignupRequestOtpInput
  ): Promise<{ otpId: string }> {
    const phone = input.phone.trim();
    if (!isValidPhone(phone)) {
      throw new ErrorWithProps("Invalid phone number");
    }

    const pending = await readPendingSignup(input.pendingToken);
    if (!pending) {
      throw new ErrorWithProps(
        "Your sign-up session has expired. Please start again.",
        { code: CustomerAuthErrorCodes.PENDING_TOKEN_EXPIRED }
      );
    }

    const rlKey = `customer_otp_request:${phone}`;
    if (!(await checkRateLimit(rlKey))) {
      throw new ErrorWithProps(
        "Too many OTP requests for this number. Try again later."
      );
    }
    await incrementRateLimit(rlKey);

    const existing = await CustomerModel.findOne({ phone })
      .select("_id")
      .lean();
    const otpId = await this.otp.generateOtp(phone, Boolean(existing));

    await updatePendingSignup(input.pendingToken, { phone, otpId });

    return { otpId };
  }

  /**
   * Phase 3 of OAuth signup — verify OTP + apply the collision matrix.
   * On success, deletes the pending entry and returns tokens. Frontend
   * uses the `outcome` to know whether to show the "linked as secondary"
   * modal. Rejections throw typed errors for the "phone account full"
   * and "email used elsewhere" cases so the frontend can route to the
   * matching modal.
   */
  async pendingSignupVerifyOtp(
    input: CustomerPendingSignupVerifyOtpInput
  ): Promise<CustomerPendingSignupVerifyOtpResponse> {
    const pending = await readPendingSignup(input.pendingToken);
    if (!pending || !pending.phone || !pending.otpId) {
      throw new ErrorWithProps(
        "Your sign-up session has expired. Please start again.",
        { code: CustomerAuthErrorCodes.PENDING_TOKEN_EXPIRED }
      );
    }

    const phone = pending.phone;
    const verifyRlKey = `customer_otp_verify:${phone}`;
    if (!(await checkRateLimit(verifyRlKey))) {
      throw new ErrorWithProps(
        "Too many failed verification attempts. Try again later."
      );
    }

    const otpResult = await this.otp.validateOtp(
      phone,
      pending.otpId,
      input.otp
    );
    if (!otpResult.status) {
      await incrementRateLimit(verifyRlKey);
      throw new ErrorWithProps(otpResult.message || "Invalid OTP");
    }
    await resetRateLimit(verifyRlKey);

    // Resolve the email to use for this signup. Google always returns
    // one. Apple may not; fall back to user-supplied input.email.
    const oauthEmail = pending.google?.email ?? pending.apple?.email;
    const emailToUse = (input.email?.trim() || oauthEmail || "").toLowerCase();
    const firstName = input.firstName?.trim();
    const lastName = input.lastName?.trim();

    if (!emailToUse || !firstName || !lastName) {
      throw new ErrorWithProps("First name, last name, and email are required.", {
        code: CustomerAuthErrorCodes.MISSING_REQUIRED_PROFILE_FIELDS,
      });
    }

    const existing = await CustomerModel.findOne({ phone, isDeleted: false });

    if (!existing) {
      // Case E — clean signup.
      const customer = await CustomerModel.create({
        phone,
        firstName,
        lastName,
        email: emailToUse,
        signupProvider:
          pending.provider === "google"
            ? SignupProvider.GOOGLE
            : SignupProvider.APPLE,
        googleConnected: pending.provider === "google",
        googleData:
          pending.provider === "google" && pending.google
            ? this.toGoogleData(pending.google)
            : undefined,
        appleConnected: pending.provider === "apple",
        appleData:
          pending.provider === "apple" && pending.apple
            ? {
                id: pending.apple.id,
                email: pending.apple.email,
                name: pending.apple.name,
                connectedAt: new Date(),
              }
            : undefined,
        profilePic: pending.google?.picture,
        authTokenVersion: 0,
      });

      if (pending.google?.picture) {
        await enqueueProfilePicMirror(
          customer._id.toString(),
          pending.google.picture
        );
      }

      enqueueLifecycleEmail(
        LifecycleEmailType.CUSTOMER_WELCOME,
        emailToUse,
        `${firstName} ${lastName}`.trim()
      ).catch((_err: unknown) => {});

      await deletePendingSignup(input.pendingToken);

      const tokens = await issueTokensAndReturn(
        customer._id.toString(),
        customer.authTokenVersion ?? 0
      );
      return {
        outcome: PendingSignupOutcome.NEW_ACCOUNT,
        customerId: customer._id.toString(),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    }

    // Phone matches an existing account → collision matrix kicks in.

    // Email collision check (Case D): the OAuth email is already used
    // as primary or secondary on a DIFFERENT customer. We can't link
    // without violating email uniqueness; reject and tell the user.
    const emailConflict = await CustomerModel.findOne({
      _id: { $ne: existing._id },
      $or: [{ email: emailToUse }, { secondaryEmail: emailToUse }],
      isDeleted: false,
    })
      .select("_id")
      .lean();
    if (emailConflict) {
      // Terminal — this OAuth identity can't ever sign up via this phone.
      // Drop the pending entry so it doesn't sit in Redis for 10 min.
      await deletePendingSignup(input.pendingToken);
      throw new ErrorWithProps(
        "Your sign-in email is already linked to a different Hoizr account. Please use that account, or sign in with a different email.",
        { code: CustomerAuthErrorCodes.EMAIL_USED_ELSEWHERE }
      );
    }

    // Email matches existing primary OR secondary already (idempotent
    // re-link). Just connect Google to this account and log them in.
    if (
      existing.email === emailToUse ||
      existing.secondaryEmail === emailToUse
    ) {
      if (pending.google) {
        this.applyGoogleLinkToCustomer(existing, pending.google);
        await existing.save();
        if (!existing.profilePic && pending.google.picture) {
          await enqueueProfilePicMirror(
            existing._id.toString(),
            pending.google.picture
          );
        }
      }
      await deletePendingSignup(input.pendingToken);
      const tokens = await issueTokensAndReturn(
        existing._id.toString(),
        existing.authTokenVersion ?? 0
      );
      return {
        outcome: PendingSignupOutcome.LINKED_AS_SECONDARY,
        customerId: existing._id.toString(),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        primaryEmailMasked: maskEmail(existing.email),
        secondaryEmail: existing.secondaryEmail ?? emailToUse,
      };
    }

    // Case C — phone matches and secondary slot is already taken by a
    // different email. Reject without modifying the existing account.
    if (existing.secondaryEmail && existing.secondaryEmail !== emailToUse) {
      // Terminal — drop the pending entry.
      await deletePendingSignup(input.pendingToken);
      throw new ErrorWithProps(
        "This phone number is already linked to a Hoizr account that has both a primary and secondary email on file. Use a different phone number, or sign in to the original account with phone OTP.",
        { code: CustomerAuthErrorCodes.PHONE_ACCOUNT_FULL }
      );
    }

    // Case B — secondary slot is free. Add this OAuth email as the
    // secondary, link Google, log in. Modal explains the linking.
    existing.secondaryEmail = emailToUse;
    if (pending.google) {
      this.applyGoogleLinkToCustomer(existing, pending.google);
    }
    await existing.save();
    if (!existing.profilePic && pending.google?.picture) {
      await enqueueProfilePicMirror(
        existing._id.toString(),
        pending.google.picture
      );
    }

    await deletePendingSignup(input.pendingToken);
    const tokens = await issueTokensAndReturn(
      existing._id.toString(),
      existing.authTokenVersion ?? 0
    );
    return {
      outcome: PendingSignupOutcome.LINKED_AS_SECONDARY,
      customerId: existing._id.toString(),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      primaryEmailMasked: maskEmail(existing.email),
      secondaryEmail: emailToUse,
    };
  }

  private toGoogleData(profile: GoogleProfile) {
    return {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
      emailVerified: profile.emailVerified,
      connectedAt: new Date(),
    };
  }

  private applyGoogleLinkToCustomer(
    customer: any,
    profile: GoogleProfile
  ): void {
    customer.googleConnected = true;
    customer.googleData = this.toGoogleData(profile);
  }
}

export default OAuthService;
