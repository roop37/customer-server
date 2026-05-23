"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("assert/strict"));
const shared_1 = require("@hoizr-technology/shared");
const cart_pricing_1 = require("../modules/cart/service/cart-pricing");
// --- Scenario A: GST-eligible host (REGULAR) — ticket GST + platform fee + GST on platform fee ---
(() => {
    const pricing = (0, cart_pricing_1.computeCartPricingForLines)({
        ticketLines: [{ ticketId: "ticket-1", quantity: 2, unitPrice: 1000 }],
        extraLines: [],
        ticketRefs: new Map([["ticket-1", { ticketGST: shared_1.TicketGST.CGST_SGST_18 }]]),
        applicationFeePercent: 5,
        applicationFeeGstPercent: 18,
        host: {
            isGstRegistered: true,
            gstin: "27ABCDE1234F1Z5",
            gstRegistrationType: shared_1.GstRegistrationType.REGULAR,
        },
    });
    strict_1.default.equal(pricing.grossAmount, 2000);
    strict_1.default.equal(pricing.taxes, 360);
    strict_1.default.equal(pricing.applicationFee, 100);
    strict_1.default.equal(pricing.platformFeeGst, 18);
    // 2000 (taxable) + 360 (ticket GST) + 100 (platform fee) + 18 (platform fee GST)
    strict_1.default.equal(pricing.totalAmount, 2478);
})();
// --- Scenario B: Ineligible host (UNREGISTERED) — no ticket GST, still platform fee + GST ---
(() => {
    const pricing = (0, cart_pricing_1.computeCartPricingForLines)({
        ticketLines: [{ ticketId: "ticket-1", quantity: 2, unitPrice: 1000 }],
        extraLines: [],
        ticketRefs: new Map([["ticket-1", { ticketGST: shared_1.TicketGST.CGST_SGST_18 }]]),
        applicationFeePercent: 5,
        applicationFeeGstPercent: 18,
        host: {
            isGstRegistered: false,
            gstin: null,
            gstRegistrationType: shared_1.GstRegistrationType.UNREGISTERED,
        },
    });
    strict_1.default.equal(pricing.grossAmount, 2000);
    strict_1.default.equal(pricing.taxes, 0, "ineligible host must not collect ticket GST");
    strict_1.default.equal(pricing.applicationFee, 100);
    strict_1.default.equal(pricing.platformFeeGst, 18);
    // 2000 (taxable) + 0 (no ticket GST) + 100 (platform fee) + 18 (platform fee GST)
    strict_1.default.equal(pricing.totalAmount, 2118);
})();
// --- Scenario C: COMPOSITION host — same as ineligible, no ticket GST ---
(() => {
    const pricing = (0, cart_pricing_1.computeCartPricingForLines)({
        ticketLines: [{ ticketId: "ticket-1", quantity: 1, unitPrice: 500 }],
        extraLines: [],
        ticketRefs: new Map([["ticket-1", { ticketGST: shared_1.TicketGST.CGST_SGST_18 }]]),
        applicationFeePercent: 5,
        applicationFeeGstPercent: 18,
        host: {
            isGstRegistered: true,
            gstin: "27ABCDE1234F1Z5",
            gstRegistrationType: shared_1.GstRegistrationType.COMPOSITION,
        },
    });
    strict_1.default.equal(pricing.taxes, 0, "composition host must not collect ticket GST");
})();
// --- Scenario D: missing host context defaults to ineligible (safe default) ---
(() => {
    const pricing = (0, cart_pricing_1.computeCartPricingForLines)({
        ticketLines: [{ ticketId: "ticket-1", quantity: 1, unitPrice: 1000 }],
        extraLines: [],
        ticketRefs: new Map([["ticket-1", { ticketGST: shared_1.TicketGST.CGST_SGST_18 }]]),
        applicationFeePercent: 5,
        applicationFeeGstPercent: 18,
        host: null,
    });
    strict_1.default.equal(pricing.taxes, 0, "missing host context defaults to no ticket GST");
})();
console.log("cart-pricing.service.test.ts passed");
