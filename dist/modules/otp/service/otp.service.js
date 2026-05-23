"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcrypt_1 = require("bcrypt");
const mercurius_1 = require("mercurius");
const moment_1 = __importDefault(require("moment"));
const node_crypto_1 = require("node:crypto");
const sms_queue_1 = require("../../../sms/sms.queue");
const crypt_1 = require("../../../utils/crypt");
const environment_1 = require("../../../utils/environment");
const otp_schema_1 = require("../schema/otp.schema");
const OTP_LENGTH = 6;
class OtpService {
    async generateOtp(phone, login) {
        try {
            await otp_schema_1.OtpModel.deleteMany({ emailOrNumber: phone });
            const otp = (0, node_crypto_1.randomInt)(0, 10 ** OTP_LENGTH)
                .toString()
                .padStart(OTP_LENGTH, "0");
            const otpHash = await (0, bcrypt_1.hash)(otp, 10);
            const otpRecord = await otp_schema_1.OtpModel.create({
                otpHash,
                emailOrNumber: phone,
                expiresAt: (0, moment_1.default)().add(5, "minute").utc().toDate(),
            });
            const message = login
                ? `Your Hoizr login code is ${otp}. Valid for 5 minutes.`
                : `Welcome to Hoizr! Your verification code is ${otp}. Valid for 5 minutes.`;
            await sms_queue_1.smsQueue.add(login ? "CUSTOMER_LOGIN_OTP" : "CUSTOMER_REGISTER_OTP", {
                phoneNumber: phone,
                message,
            });
            return (0, crypt_1.encryptData)(otpRecord._id.toString());
        }
        catch {
            throw new mercurius_1.ErrorWithProps("Unable to send OTP, please try again.");
        }
    }
    async validateOtp(phone, otpId, otp) {
        try {
            if (otp === "000000" && environment_1.EnvVars.values.SERVER_ENV === "development") {
                return { status: true, message: "" };
            }
            const decryptedId = (0, crypt_1.decryptData)(otpId);
            const otpRecord = await otp_schema_1.OtpModel.findOne({ _id: decryptedId })
                .select("otpHash expiresAt emailOrNumber")
                .lean();
            if (!otpRecord) {
                return { status: false, message: "Invalid OTP" };
            }
            if ((0, moment_1.default)(otpRecord.expiresAt).utc().isBefore(moment_1.default.utc())) {
                return { status: false, message: "OTP has expired, please request a new one" };
            }
            if (phone !== otpRecord.emailOrNumber) {
                return { status: false, message: "Invalid OTP" };
            }
            const isMatch = await (0, bcrypt_1.compare)(otp, otpRecord.otpHash);
            if (!isMatch) {
                return { status: false, message: "Invalid OTP" };
            }
            await otp_schema_1.OtpModel.deleteOne({ _id: decryptedId });
            return { status: true, message: "" };
        }
        catch (error) {
            throw error;
        }
    }
}
exports.default = OtpService;
