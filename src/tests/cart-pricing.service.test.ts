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

// --- Scenario E: AUDIT-068 reconciliation — Σ component paise == total paise
// across multi-line + odd amounts/rates that would drift under float math ---
(() => {
  const pricing = computeCartPricingForLines({
    ticketLines: [
      { ticketId: "t1", quantity: 3, unitPrice: 333 },
      { ticketId: "t2", quantity: 1, unitPrice: 199 },
    ],
    extraLines: [{ quantity: 2, unitPrice: 49 }],
    ticketRefs: new Map([
      ["t1", { ticketGST: TicketGST.CGST_SGST_18 }],
      ["t2", { ticketGST: TicketGST.OTHER, gstRate: 12 }],
    ]),
    applicationFeePercent: 5,
    applicationFeeGstPercent: 18,
    host: {
      isGstRegistered: true,
      gstin: "27ABCDE1234F1Z5",
      gstRegistrationType: GstRegistrationType.REGULAR,
    },
  });

  const toP = (n: number) => Math.round(n * 100);
  const sumP =
    toP(pricing.grossAmount) +
    toP(pricing.taxes) +
    toP(pricing.applicationFee) +
    toP(pricing.platformFeeGst);
  assert.equal(
    sumP,
    toP(pricing.totalAmount),
    "components must sum to the total to the exact paise"
  );
  // grossAmount = 3*333 + 199 + 2*49 = 999 + 199 + 98 = 1296
  assert.equal(pricing.grossAmount, 1296);
})();

console.log("cart-pricing.service.test.ts passed");
