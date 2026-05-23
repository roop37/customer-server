import { Otp } from "@hoizr-technology/shared";
import { getModelForClass } from "@typegoose/typegoose";

const OtpModel = getModelForClass(Otp, {
  schemaOptions: { timestamps: true },
});

export { Otp, OtpModel };
