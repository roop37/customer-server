"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRazorpayPayments = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const environment_1 = require("./environment");
// Mirror of main-server/src/utils/razorpay.client.ts so the customer-side
// checkout, the host-side payout retry path, and any future server-side
// Razorpay touch use the same wrapper. Keeping them in lockstep means a
// behaviour change (new auth header, new error shape, new endpoint) lands
// in one place and is then copied here.
const RAZORPAY_BASE_URL = "https://api.razorpay.com/v1";
class RazorpayPaymentsClient {
    ensureConfigured() {
        const keyId = environment_1.EnvVars.values.RAZORPAY_KEY_ID;
        const keySecret = environment_1.EnvVars.values.RAZORPAY_KEY_SECRET;
        if (!keyId || !keySecret) {
            throw new Error("Razorpay payments are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
        }
        return { keyId, keySecret };
    }
    get keyId() {
        return this.ensureConfigured().keyId;
    }
    async createOrder(input) {
        const { keyId, keySecret } = this.ensureConfigured();
        const response = await axios_1.default.post(`${RAZORPAY_BASE_URL}/orders`, {
            amount: input.amountPaise,
            currency: input.currency,
            receipt: input.receipt,
            notes: input.notes,
        }, {
            auth: {
                username: keyId,
                password: keySecret,
            },
        });
        return response.data;
    }
    async fetchPayment(paymentId) {
        const { keyId, keySecret } = this.ensureConfigured();
        const response = await axios_1.default.get(`${RAZORPAY_BASE_URL}/payments/${encodeURIComponent(paymentId)}`, { auth: { username: keyId, password: keySecret } });
        return response.data;
    }
    async refundPayment(paymentId, options = {}) {
        const { keyId, keySecret } = this.ensureConfigured();
        const body = { speed: "optimum" };
        if (options.amountPaise)
            body.amount = options.amountPaise;
        if (options.notes)
            body.notes = options.notes;
        const response = await axios_1.default.post(`${RAZORPAY_BASE_URL}/payments/${encodeURIComponent(paymentId)}/refund`, body, { auth: { username: keyId, password: keySecret } });
        return response.data;
    }
    // Razorpay Checkout post-payment signature:
    //   expected = HMAC-SHA256(`${orderId}|${paymentId}`, keySecret)
    // Returns false (never throws) so callers can branch cleanly.
    verifyCheckoutSignature(input) {
        const { keySecret } = this.ensureConfigured();
        const expected = crypto_1.default
            .createHmac("sha256", keySecret)
            .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
            .digest("hex");
        const provided = input.razorpaySignature ?? "";
        if (expected.length !== provided.length)
            return false;
        try {
            return crypto_1.default.timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(provided, "utf8"));
        }
        catch {
            return false;
        }
    }
}
let razorpayPaymentsClient = null;
const getRazorpayPayments = () => {
    if (!razorpayPaymentsClient) {
        razorpayPaymentsClient = new RazorpayPaymentsClient();
    }
    return razorpayPaymentsClient;
};
exports.getRazorpayPayments = getRazorpayPayments;
