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
const rateLimit_1 = require("../../../utils/rateLimit");
const validations_1 = require("../../../utils/validations");
const jwt_1 = require("../../../utils/jwt");
const auth_errors_1 = require("../interfaces/auth.errors");
class AuthService {
    constructor() {
        this.otp = new otp_service_1.default();
    }
    async requestOtp(input) {
        const phone = input.phone.trim();
        if (!(0, validations_1.isValidPhone)(phone)) {
            throw new mercurius_1.ErrorWithProps("Invalid phone number");
        }
        // Rate limit OTP requests per phone — prevents abuse of the
        // DoubleTick/SMS budget and blocks brute-force enumeration of
        // existing customers via the requestOtp response.
        const rlKey = `customer_otp_request:${phone}`;
        if (!(await (0, rateLimit_1.checkRateLimit)(rlKey))) {
            throw new mercurius_1.ErrorWithProps("Too many OTP requests for this number. Try again later.");
        }
        await (0, rateLimit_1.incrementRateLimit)(rlKey);
        const existing = await customer_schema_1.CustomerModel.findOne({ phone }).select("_id").lean();
        return this.otp.generateOtp(phone, Boolean(existing));
    }
    async verifyOtp(input) {
        const phone = input.phone.trim();
        if (!(0, validations_1.isValidPhone)(phone)) {
            throw new mercurius_1.ErrorWithProps("Invalid phone number");
        }
        // Rate limit verification attempts per phone — prevents OTP brute-force.
        const verifyRlKey = `customer_otp_verify:${phone}`;
        if (!(await (0, rateLimit_1.checkRateLimit)(verifyRlKey))) {
            throw new mercurius_1.ErrorWithProps("Too many failed verification attempts. Try again later.");
        }
        const result = await this.otp.validateOtp(phone, input.otpId, input.otp);
        if (!result.status) {
            // Only count failed verifications toward the lockout — successful
            // ones reset the counter so a legitimate user isn't penalised.
            await (0, rateLimit_1.incrementRateLimit)(verifyRlKey);
            throw new mercurius_1.ErrorWithProps(result.message || "Invalid OTP");
        }
        await (0, rateLimit_1.resetRateLimit)(verifyRlKey);
        let customer = await customer_schema_1.CustomerModel.findOne({ phone, isDeleted: false });
        let isNewCustomer = false;
        if (!customer) {
            const firstName = input.firstName?.trim();
            const lastName = input.lastName?.trim();
            const email = input.email?.trim().toLowerCase();
            if (!firstName || !lastName || !email) {
                throw new mercurius_1.ErrorWithProps("First name, last name, and email are required to create a new account.", { code: auth_errors_1.CustomerAuthErrorCodes.MISSING_REQUIRED_PROFILE_FIELDS });
            }
            // Email-uniqueness guard. We enforce it at the schema level too,
            // but checking here lets us return a clean error instead of a
            // Mongo duplicate-key 500.
            const emailTaken = await customer_schema_1.CustomerModel.findOne({
                $or: [{ email }, { secondaryEmail: email }],
                isDeleted: false,
            })
                .select("_id")
                .lean();
            if (emailTaken) {
                throw new mercurius_1.ErrorWithProps("That email is already in use on another Hoizr account. Use a different email or sign in with Google.", { code: auth_errors_1.CustomerAuthErrorCodes.EMAIL_USED_ELSEWHERE });
            }
            customer = await customer_schema_1.CustomerModel.create({
                phone,
                firstName,
                lastName,
                email,
                signupProvider: shared_1.SignupProvider.PHONE,
                authTokenVersion: 0,
            });
            isNewCustomer = true;
        }
        // Welcome email only on customer creation, fire-and-forget via queue.
        if (isNewCustomer && customer.email) {
            (0, lifecycle_queue_1.enqueueLifecycleEmail)(shared_1.LifecycleEmailType.CUSTOMER_WELCOME, customer.email, [customer.firstName, customer.lastName].filter(Boolean).join(" ") ||
                undefined).catch((_err) => { });
        }
        const uniqueId = (0, nanoid_1.nanoid)();
        const { accessToken, refreshToken } = (0, jwt_1.createCustomerAuthTokens)({
            customer: customer._id.toString(),
            version: customer.authTokenVersion ?? 0,
            uniqueId,
        });
        await (0, jwt_1.storeCustomerRefreshToken)(customer._id.toString(), uniqueId, refreshToken);
        return {
            customerId: customer._id.toString(),
            accessToken,
            refreshToken,
            uniqueId,
        };
    }
}
exports.default = AuthService;
