import axios from "axios";
import crypto from "crypto";
import { EnvVars } from "./environment";

// Mirror of main-server/src/utils/razorpay.client.ts so the customer-side
// checkout, the host-side payout retry path, and any future server-side
// Razorpay touch use the same wrapper. Keeping them in lockstep means a
// behaviour change (new auth header, new error shape, new endpoint) lands
// in one place and is then copied here.

const RAZORPAY_BASE_URL = "https://api.razorpay.com/v1";

export type RazorpayOrderResponse = {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
  notes?: Record<string, string>;
};

export type CreateRazorpayOrderInput = {
  amountPaise: number;
  currency: "INR";
  receipt: string;
  notes: Record<string, string>;
};

export type RazorpayPaymentResponse = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  order_id?: string;
  notes?: Record<string, string>;
};

export type RazorpayRefundResponse = {
  id: string;
  payment_id: string;
  amount: number;
  status: string;
  speed_processed?: string;
  notes?: Record<string, string>;
};

class RazorpayPaymentsClient {
  private ensureConfigured(): { keyId: string; keySecret: string } {
    const keyId = EnvVars.values.RAZORPAY_KEY_ID;
    const keySecret = EnvVars.values.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      throw new Error(
        "Razorpay payments are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET."
      );
    }

    return { keyId, keySecret };
  }

  get keyId(): string {
    return this.ensureConfigured().keyId;
  }

  async createOrder(
    input: CreateRazorpayOrderInput
  ): Promise<RazorpayOrderResponse> {
    const { keyId, keySecret } = this.ensureConfigured();
    const response = await axios.post<RazorpayOrderResponse>(
      `${RAZORPAY_BASE_URL}/orders`,
      {
        amount: input.amountPaise,
        currency: input.currency,
        receipt: input.receipt,
        notes: input.notes,
      },
      {
        auth: {
          username: keyId,
          password: keySecret,
        },
      }
    );
    return response.data;
  }

  async fetchPayment(paymentId: string): Promise<RazorpayPaymentResponse> {
    const { keyId, keySecret } = this.ensureConfigured();
    const response = await axios.get<RazorpayPaymentResponse>(
      `${RAZORPAY_BASE_URL}/payments/${encodeURIComponent(paymentId)}`,
      { auth: { username: keyId, password: keySecret } }
    );
    return response.data;
  }

  async refundPayment(
    paymentId: string,
    options: { amountPaise?: number; notes?: Record<string, string> } = {}
  ): Promise<RazorpayRefundResponse> {
    const { keyId, keySecret } = this.ensureConfigured();
    const body: Record<string, unknown> = { speed: "optimum" };
    if (options.amountPaise) body.amount = options.amountPaise;
    if (options.notes) body.notes = options.notes;
    const response = await axios.post<RazorpayRefundResponse>(
      `${RAZORPAY_BASE_URL}/payments/${encodeURIComponent(paymentId)}/refund`,
      body,
      { auth: { username: keyId, password: keySecret } }
    );
    return response.data;
  }

  // Razorpay Checkout post-payment signature:
  //   expected = HMAC-SHA256(`${orderId}|${paymentId}`, keySecret)
  // Returns false (never throws) so callers can branch cleanly.
  verifyCheckoutSignature(input: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }): boolean {
    const { keySecret } = this.ensureConfigured();
    const expected = crypto
      .createHmac("sha256", keySecret)
      .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
      .digest("hex");
    const provided = input.razorpaySignature ?? "";
    if (expected.length !== provided.length) return false;
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected, "utf8"),
        Buffer.from(provided, "utf8")
      );
    } catch {
      return false;
    }
  }
}

let razorpayPaymentsClient: RazorpayPaymentsClient | null = null;

export const getRazorpayPayments = (): RazorpayPaymentsClient => {
  if (!razorpayPaymentsClient) {
    razorpayPaymentsClient = new RazorpayPaymentsClient();
  }
  return razorpayPaymentsClient;
};
