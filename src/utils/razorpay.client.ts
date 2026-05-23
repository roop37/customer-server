import Razorpay from "razorpay";
import { EnvVars } from "./environment";

let razorpayInstance: Razorpay | null = null;

export const getRazorpay = (): Razorpay => {
  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: EnvVars.values.RAZORPAY_KEY_ID,
      key_secret: EnvVars.values.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpayInstance;
};
