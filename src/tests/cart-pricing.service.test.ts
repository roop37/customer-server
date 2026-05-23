import assert from "assert/strict";
import { GstRegistrationType, TicketGST } from "@hoizr-technology/shared";
import { computeCartPricingForLines } from "../modules/cart/service/cart-pricing";

// --- Scenario A: GST-eligible host (REGULAR) — ticket GST + platform fee + GST on platform fee ---
(() => {
  const pricing = computeCartPricingForLines({
    ticketLines: [{ ticketId: "ticket-1", quantity: 2, unitPrice: 1000 }],
    extraLines: [],
    ticketRefs: new Map([["ticket-1", { ticketGST: TicketGST.CGST_SGST_18 }]]),
    applicationFeePercent: 5,
    applicationFeeGstPercent: 18,
    host: {
      isGstRegistered: true,
      gstin: "27ABCDE1234F1Z5",
      gstRegistrationType: GstRegistrationType.REGULAR,
    },
  });

  assert.equal(pricing.grossAmount, 2000);
  assert.equal(pricing.taxes, 360);
  assert.equal(pricing.applicationFee, 100);
  assert.equal(pricing.platformFeeGst, 18);
  // 2000 (taxable) + 360 (ticket GST) + 100 (platform fee) + 18 (platform fee GST)
  assert.equal(pricing.totalAmount, 2478);
})();

// --- Scenario B: Ineligible host (UNREGISTERED) — no ticket GST, still platform fee + GST ---
(() => {
  const pricing = computeCartPricingForLines({
    ticketLines: [{ ticketId: "ticket-1", quantity: 2, unitPrice: 1000 }],
    extraLines: [],
    ticketRefs: new Map([["ticket-1", { ticketGST: TicketGST.CGST_SGST_18 }]]),
    applicationFeePercent: 5,
    applicationFeeGstPercent: 18,
    host: {
      isGstRegistered: false,
      gstin: null,
      gstRegistrationType: GstRegistrationType.UNREGISTERED,
    },
  });

  assert.equal(pricing.grossAmount, 2000);
  assert.equal(pricing.taxes, 0, "ineligible host must not collect ticket GST");
  assert.equal(pricing.applicationFee, 100);
  assert.equal(pricing.platformFeeGst, 18);
  // 2000 (taxable) + 0 (no ticket GST) + 100 (platform fee) + 18 (platform fee GST)
  assert.equal(pricing.totalAmount, 2118);
})();

// --- Scenario C: COMPOSITION host — same as ineligible, no ticket GST ---
(() => {
  const pricing = computeCartPricingForLines({
    ticketLines: [{ ticketId: "ticket-1", quantity: 1, unitPrice: 500 }],
    extraLines: [],
    ticketRefs: new Map([["ticket-1", { ticketGST: TicketGST.CGST_SGST_18 }]]),
    applicationFeePercent: 5,
    applicationFeeGstPercent: 18,
    host: {
      isGstRegistered: true,
      gstin: "27ABCDE1234F1Z5",
      gstRegistrationType: GstRegistrationType.COMPOSITION,
    },
  });

  assert.equal(pricing.taxes, 0, "composition host must not collect ticket GST");
})();

// --- Scenario D: missing host context defaults to ineligible (safe default) ---
(() => {
  const pricing = computeCartPricingForLines({
    ticketLines: [{ ticketId: "ticket-1", quantity: 1, unitPrice: 1000 }],
    extraLines: [],
    ticketRefs: new Map([["ticket-1", { ticketGST: TicketGST.CGST_SGST_18 }]]),
    applicationFeePercent: 5,
    applicationFeeGstPercent: 18,
    host: null,
  });

  assert.equal(pricing.taxes, 0, "missing host context defaults to no ticket GST");
})();

console.log("cart-pricing.service.test.ts passed");
