import { compare, hash } from "bcrypt";
import { ErrorWithProps } from "mercurius";
import moment from "moment";
import { randomInt } from "node:crypto";
import { smsQueue } from "../../../sms/sms.queue";
import { decryptData, encryptData } from "../../../utils/crypt";
import { EnvVars } from "../../../utils/environment";
import { enqueueWhatsAppOtp } from "../../../utils/primary-whatsapp.queue";
import { OtpModel } from "../schema/otp.schema";

const OTP_LENGTH = 6;

class OtpService {
  async generateOtp(phone: string, login: boolean): Promise<string> {
    try {
      await OtpModel.deleteMany({ emailOrNumber: phone });

      const otp = randomInt(0, 10 ** OTP_LENGTH)
        .toString()
        .padStart(OTP_LENGTH, "0");

      const otpHash = await hash(otp, 10);

      const otpRecord = await OtpModel.create({
        otpHash,
        emailOrNumber: phone,
        expiresAt: moment().add(5, "minute").utc().toDate(),
      });

      const message = login
        ? `Your Hoizr login code is ${otp}. Valid for 5 minutes.`
        : `Welcome to Hoizr! Your verification code is ${otp}. Valid for 5 minutes.`;

      // WhatsApp is the PRIMARY OTP channel (Meta Cloud API, Hoizr's WABA);
      // in dev / without keys the worker console-logs the send. SMS is
      // retained as a parallel fallback during rollout so OTP is never
      // undelivered while the WhatsApp auth template clears Meta review —
      // once WhatsApp delivery is proven in prod this becomes
      // failure-triggered only. `phone` is already canonical E.164.
      try {
        await enqueueWhatsAppOtp(phone, otp);
      } catch {
        // never let a WhatsApp enqueue failure block the SMS fallback
      }

      await smsQueue.add(login ? "CUSTOMER_LOGIN_OTP" : "CUSTOMER_REGISTER_OTP", {
        phoneNumber: phone,
        message,
      });

      return encryptData(otpRecord._id.toString());
    } catch {
      throw new ErrorWithProps("Unable to send OTP, please try again.");
    }
  }

  async validateOtp(
    phone: string,
    otpId: string,
    otp: string
  ): Promise<{ status: boolean; message: string }> {
    try {
      if (otp === "000000" && EnvVars.values.SERVER_ENV === "development") {
        return { status: true, message: "" };
      }

      const decryptedId = decryptData(otpId);
      const otpRecord = await OtpModel.findOne({ _id: decryptedId })
        .select("otpHash expiresAt emailOrNumber")
        .lean();

      if (!otpRecord) {
        return { status: false, message: "Invalid OTP" };
      }

      if (moment(otpRecord.expiresAt).utc().isBefore(moment.utc())) {
        return { status: false, message: "OTP has expired, please request a new one" };
      }

      if (phone !== otpRecord.emailOrNumber) {
        return { status: false, message: "Invalid OTP" };
      }

      const isMatch = await compare(otp, otpRecord.otpHash);
      if (!isMatch) {
        return { status: false, message: "Invalid OTP" };
      }

      await OtpModel.deleteOne({ _id: decryptedId });
      return { status: true, message: "" };
    } catch (error) {
      throw error;
    }
  }
}

export default OtpService;
