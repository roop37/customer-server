"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const shared_1 = require("@hoizr-technology/shared");
const mercurius_1 = require("mercurius");
const nanoid_1 = require("nanoid");
const customer_schema_1 = require("../../customer/schema/customer.schema");
const otp_service_1 = __importDefault(require("../../otp/service/otp.service"));
const lifecycle_queue_1 = require("../../../utils/lifecycle.queue");
const profile_pic_mirror_queue_1 = require("../../../utils/profile-pic-mirror.queue");
const rateLimit_1 = require("../../../utils/rateLimit");
const validations_1 = require("../../../utils/validations");
const jwt_1 = require("../../../utils/jwt");
const auth_errors_1 = require("../interfaces/auth.errors");
const auth_objects_1 = require("../interfaces/auth.objects");
const pending_signup_store_1 = require("./pending-signup.store");
const oauth_verifier_1 = require("./oauth-verifier");
const issueTokensAndReturn = async (customerId, authTokenVersion) => {
    const uniqueId = (0, nanoid_1.nanoid)();
    const { accessToken, refreshToken } = (0, jwt_1.createCustomerAuthTokens)({
        customer: customerId,
        version: authTokenVersion ?? 0,
        uniqueId,
    });
    await (0, jwt_1.storeCustomerRefreshToken)(customerId, uniqueId, refreshToken);
    return { accessToken, refreshToken, uniqueId };
};
const maskEmail = (email) => {
    if (!email)
        return undefined;
    const [local, domain] = email.split("@");
    if (!domain)
        return email;
    if (local.length <= 2)
        return `${local[0] ?? ""}***@${domain}`;
    return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`;
};
class OAuthService {
    constructor() {
        this.otp = new otp_service_1.default();
    }
    /**
     * Google sign-in start. Three outcomes:
     *   - LOGGED_IN: existing customer matched by googleData.id.
     *   - LINKED_EXISTING_BY_EMAIL: existing phone-OTP customer matched by
     *     primary or secondary email — Google was just linked on the spot.
     *   - PENDING_PHONE_REQUIRED: no matching account; client must complete
     *     phone-OTP via the pending-signup mutations.
     */
    async googleStart(input) {
        const profile = await (0, oauth_verifier_1.verifyGoogleIdToken)(input.idToken);
        // 1) Already-linked Google account → straight login.
        const existingByGoogle = await customer_schema_1.CustomerModel.findOne({
            "googleData.id": profile.id,
            isDeleted: false,
        });
        if (existingByGoogle) {
            const tokens = await issueTokensAndReturn(existingByGoogle._id.toString(), existingByGoogle.authTokenVersion ?? 0);
            return {
                outcome: auth_objects_1.GoogleStartOutcome.LOGGED_IN,
                customerId: existingByGoogle._id.toString(),
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                uniqueId: tokens.uniqueId,
            };
        }
        // 2) Existing account by email match (primary or secondary). Link
        //    Google now and issue tokens. Frontend shows a "we connected
        //    your Google sign-in to your existing account" modal so the
        //    customer knows what happened.
        const existingByEmail = await customer_schema_1.CustomerModel.findOne({
            $or: [{ email: profile.email }, { secondaryEmail: profile.email }],
            isDeleted: false,
        });
        if (existingByEmail) {
            this.applyGoogleLinkToCustomer(existingByEmail, profile);
            await existingByEmail.save();
            if (existingByEmail.profilePic === undefined && profile.picture) {
                await (0, profile_pic_mirror_queue_1.enqueueProfilePicMirror)(existingByEmail._id.toString(), profile.picture);
            }
            const tokens = await issueTokensAndReturn(existingByEmail._id.toString(), existingByEmail.authTokenVersion ?? 0);
            return {
                outcome: auth_objects_1.GoogleStartOutcome.LINKED_EXISTING_BY_EMAIL,
                customerId: existingByEmail._id.toString(),
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                uniqueId: tokens.uniqueId,
            };
        }
        // 3) Brand-new — open a pending signup. Client collects + verifies
        //    phone OTP before the account is created.
        const pendingToken = await (0, pending_signup_store_1.createPendingSignup)({
            provider: "google",
            google: profile,
        });
        return {
            outcome: auth_objects_1.GoogleStartOutcome.PENDING_PHONE_REQUIRED,
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
    async appleStart(_input) {
        throw new mercurius_1.ErrorWithProps("Sign in with Apple isn't enabled yet. Please use Google or phone OTP for now.", { code: auth_errors_1.CustomerAuthErrorCodes.APPLE_NOT_CONFIGURED });
    }
    /**
     * Phase 2 of OAuth signup — collect + send OTP to the customer's
     * phone. Uses the same RingCentral/SMS path as the existing phone
     * login. Rate-limited per phone to keep OTP budget bounded.
     */
    async pendingSignupRequestOtp(input) {
        const normalized = (0, validations_1.normalizeCustomerPhone)(input.phone);
        if (!normalized) {
            throw new mercurius_1.ErrorWithProps("Invalid phone number");
        }
        const { raw, e164 } = normalized;
        const pending = await (0, pending_signup_store_1.readPendingSignup)(input.pendingToken);
        if (!pending) {
            throw new mercurius_1.ErrorWithProps("Your sign-up session has expired. Please start again.", { code: auth_errors_1.CustomerAuthErrorCodes.PENDING_TOKEN_EXPIRED });
        }
        const rlKey = `customer_otp_request:${e164}`;
        if (!(await (0, rateLimit_1.checkRateLimit)(rlKey))) {
            throw new mercurius_1.ErrorWithProps("Too many OTP requests for this number. Try again later.");
        }
        await (0, rateLimit_1.incrementRateLimit)(rlKey);
        const existing = await customer_schema_1.CustomerModel.findOne({
            $or: [{ phoneE164: e164 }, { phone: e164 }, { phone: raw }],
            isDeleted: false,
        })
            .select("_id")
            .lean();
        const otpId = await this.otp.generateOtp(e164, Boolean(existing));
        // Always persist E.164 in pending — the verify step reads back from
        // here and writes the customer doc.
        await (0, pending_signup_store_1.updatePendingSignup)(input.pendingToken, { phone: e164, otpId });
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
    async pendingSignupVerifyOtp(input) {
        const pending = await (0, pending_signup_store_1.readPendingSignup)(input.pendingToken);
        if (!pending || !pending.phone || !pending.otpId) {
            throw new mercurius_1.ErrorWithProps("Your sign-up session has expired. Please start again.", { code: auth_errors_1.CustomerAuthErrorCodes.PENDING_TOKEN_EXPIRED });
        }
        const phone = pending.phone;
        const verifyRlKey = `customer_otp_verify:${phone}`;
        if (!(await (0, rateLimit_1.checkRateLimit)(verifyRlKey))) {
            throw new mercurius_1.ErrorWithProps("Too many failed verification attempts. Try again later.");
        }
        const otpResult = await this.otp.validateOtp(phone, pending.otpId, input.otp);
        if (!otpResult.status) {
            await (0, rateLimit_1.incrementRateLimit)(verifyRlKey);
            throw new mercurius_1.ErrorWithProps(otpResult.message || "Invalid OTP");
        }
        await (0, rateLimit_1.resetRateLimit)(verifyRlKey);
        // Resolve the email to use for this signup. Google always returns
        // one. Apple may not; fall back to user-supplied input.email.
        const oauthEmail = pending.google?.email ?? pending.apple?.email;
        const emailToUse = (input.email?.trim() || oauthEmail || "").toLowerCase();
        const firstName = input.firstName?.trim();
        const lastName = input.lastName?.trim();
        if (!emailToUse || !firstName || !lastName) {
            throw new mercurius_1.ErrorWithProps("First name, last name, and email are required.", {
                code: auth_errors_1.CustomerAuthErrorCodes.MISSING_REQUIRED_PROFILE_FIELDS,
            });
        }
        // `phone` from the pending entry is now always E.164 (post-D16). For
        // pre-D16 pending entries that were created before this rollout, the
        // dual-lookup still finds the legacy record.
        const existing = await customer_schema_1.CustomerModel.findOne({
            $or: [{ phoneE164: phone }, { phone }],
            isDeleted: false,
        });
        if (!existing) {
            // Case E — clean signup.
            const customer = await customer_schema_1.CustomerModel.create({
                phone,
                phoneE164: phone,
                firstName,
                lastName,
                email: emailToUse,
                signupProvider: pending.provider === "google"
                    ? shared_1.SignupProvider.GOOGLE
                    : shared_1.SignupProvider.APPLE,
                googleConnected: pending.provider === "google",
                googleData: pending.provider === "google" && pending.google
                    ? this.toGoogleData(pending.google)
                    : undefined,
                appleConnected: pending.provider === "apple",
                appleData: pending.provider === "apple" && pending.apple
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
                await (0, profile_pic_mirror_queue_1.enqueueProfilePicMirror)(customer._id.toString(), pending.google.picture);
            }
            (0, lifecycle_queue_1.enqueueLifecycleEmail)(shared_1.LifecycleEmailType.CUSTOMER_WELCOME, emailToUse, `${firstName} ${lastName}`.trim()).catch((_err) => { });
            await (0, pending_signup_store_1.deletePendingSignup)(input.pendingToken);
            const tokens = await issueTokensAndReturn(customer._id.toString(), customer.authTokenVersion ?? 0);
            return {
                outcome: auth_objects_1.PendingSignupOutcome.NEW_ACCOUNT,
                customerId: customer._id.toString(),
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                uniqueId: tokens.uniqueId,
            };
        }
        // Phone matches an existing account → collision matrix kicks in.
        // Email collision check (Case D): the OAuth email is already used
        // as primary or secondary on a DIFFERENT customer. We can't link
        // without violating email uniqueness; reject and tell the user.
        const emailConflict = await customer_schema_1.CustomerModel.findOne({
            _id: { $ne: existing._id },
            $or: [{ email: emailToUse }, { secondaryEmail: emailToUse }],
            isDeleted: false,
        })
            .select("_id")
            .lean();
        if (emailConflict) {
            // Terminal — this OAuth identity can't ever sign up via this phone.
            // Drop the pending entry so it doesn't sit in Redis for 10 min.
            await (0, pending_signup_store_1.deletePendingSignup)(input.pendingToken);
            throw new mercurius_1.ErrorWithProps("Your sign-in email is already linked to a different Hoizr account. Please use that account, or sign in with a different email.", { code: auth_errors_1.CustomerAuthErrorCodes.EMAIL_USED_ELSEWHERE });
        }
        // Email matches existing primary OR secondary already (idempotent
        // re-link). Just connect Google to this account and log them in.
        if (existing.email === emailToUse ||
            existing.secondaryEmail === emailToUse) {
            if (pending.google) {
                this.applyGoogleLinkToCustomer(existing, pending.google);
                await existing.save();
                if (!existing.profilePic && pending.google.picture) {
                    await (0, profile_pic_mirror_queue_1.enqueueProfilePicMirror)(existing._id.toString(), pending.google.picture);
                }
            }
            await (0, pending_signup_store_1.deletePendingSignup)(input.pendingToken);
            const tokens = await issueTokensAndReturn(existing._id.toString(), existing.authTokenVersion ?? 0);
            return {
                outcome: auth_objects_1.PendingSignupOutcome.LINKED_AS_SECONDARY,
                customerId: existing._id.toString(),
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                uniqueId: tokens.uniqueId,
                primaryEmailMasked: maskEmail(existing.email),
                secondaryEmail: existing.secondaryEmail ?? emailToUse,
            };
        }
        // Case C — phone matches and secondary slot is already taken by a
        // different email. Reject without modifying the existing account.
        if (existing.secondaryEmail && existing.secondaryEmail !== emailToUse) {
            // Terminal — drop the pending entry.
            await (0, pending_signup_store_1.deletePendingSignup)(input.pendingToken);
            throw new mercurius_1.ErrorWithProps("This phone number is already linked to a Hoizr account that has both a primary and secondary email on file. Use a different phone number, or sign in to the original account with phone OTP.", { code: auth_errors_1.CustomerAuthErrorCodes.PHONE_ACCOUNT_FULL });
        }
        // Case B — secondary slot is free. Add this OAuth email as the
        // secondary, link Google, log in. Modal explains the linking.
        existing.secondaryEmail = emailToUse;
        if (pending.google) {
            this.applyGoogleLinkToCustomer(existing, pending.google);
        }
        await existing.save();
        if (!existing.profilePic && pending.google?.picture) {
            await (0, profile_pic_mirror_queue_1.enqueueProfilePicMirror)(existing._id.toString(), pending.google.picture);
        }
        await (0, pending_signup_store_1.deletePendingSignup)(input.pendingToken);
        const tokens = await issueTokensAndReturn(existing._id.toString(), existing.authTokenVersion ?? 0);
        return {
            outcome: auth_objects_1.PendingSignupOutcome.LINKED_AS_SECONDARY,
            customerId: existing._id.toString(),
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            uniqueId: tokens.uniqueId,
            primaryEmailMasked: maskEmail(existing.email),
            secondaryEmail: emailToUse,
        };
    }
    toGoogleData(profile) {
        return {
            id: profile.id,
            email: profile.email,
            name: profile.name,
            picture: profile.picture,
            emailVerified: profile.emailVerified,
            connectedAt: new Date(),
        };
    }
    applyGoogleLinkToCustomer(customer, profile) {
        customer.googleConnected = true;
        customer.googleData = this.toGoogleData(profile);
    }
}
exports.default = OAuthService;
