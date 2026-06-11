"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeCartPricingForLines = exports.resolveGstRateForTicket = void 0;
const shared_1 = require("@hoizr-technology/shared");
/**
 * Resolve the GST rate (as a percent) that applies to one ticket variant.
 * 18% for CGST_SGST_18 / IGST_18, 0% for ZERO / NONE / missing, and the
 * host-declared `gstRate` when the host picked OTHER.
 */
const resolveGstRateForTicket = (ref) => {
    switch (ref.ticketGST) {
        case shared_1.TicketGST.CGST_SGST_18:
        case shared_1.TicketGST.IGST_18:
            return 18;
        case shared_1.TicketGST.OTHER:
            return Number(ref.gstRate ?? 0);
        case shared_1.TicketGST.ZERO:
        case shared_1.TicketGST.NONE:
        default:
            return 0;
    }
};
exports.resolveGstRateForTicket = resolveGstRateForTicket;
/**
 * Mirror of `canHostCollectTicketGst` in main-server. Duplicated here to
 * avoid pulling main-server code into customer-server.
 */
const canHostCollectTicketGst = (host) => {
    if (!host)
        return false;
    if (!host.isGstRegistered)
        return false;
    if (!host.gstin)
        return false;
    const type = host.gstRegistrationType;
    if (!type)
        return false;
    return (type === shared_1.GstRegistrationType.REGULAR ||
        type === shared_1.GstRegistrationType.CASUAL_TAXABLE_PERSON);
};
// rupees → integer paise (nearest paise; handles any fractional input).
const toPaise = (rupees) => Math.round(Number(rupees) * 100);
// integer paise → rupees, exact for a paise integer.
const toRupees = (paise) => paise / 100;
// percentOf a paise integer, rounded to the nearest paise. `percent` may be
// fractional (e.g. an OTHER ticket gstRate); rounding per call mirrors how a
// real invoice rounds each line item.
const pctOfPaise = (paise, percent) => Math.round((paise * percent) / 100);
const computeCartPricingForLines = (input) => {
    const ticketsGrossPaise = input.ticketLines.reduce((sum, l) => sum + toPaise(l.unitPrice) * Math.max(0, Math.trunc(l.quantity)), 0);
    const extrasGrossPaise = input.extraLines.reduce((sum, l) => sum + toPaise(l.unitPrice) * Math.max(0, Math.trunc(l.quantity)), 0);
    // Ticket TAXABLE value = sum of ticket face values + extras. Base for BOTH
    // the customer-facing platform fee AND the host-side commission. Ticket
    // GST sits ABOVE this and is pass-through to the host.
    const taxablePaise = ticketsGrossPaise + extrasGrossPaise;
    // Ticket GST only when the host is GST-eligible. Rounded PER LINE.
    const eligibleForTicketGst = canHostCollectTicketGst(input.host);
    const taxesPaise = eligibleForTicketGst
        ? input.ticketLines.reduce((sum, l) => {
            if (!l.ticketId)
                return sum;
            const ref = input.ticketRefs.get(l.ticketId);
            if (!ref)
                return sum;
            const rate = (0, exports.resolveGstRateForTicket)(ref);
            const lineTaxablePaise = toPaise(l.unitPrice) * Math.max(0, Math.trunc(l.quantity));
            return sum + pctOfPaise(lineTaxablePaise, rate);
        }, 0)
        : 0;
    // Customer-facing platform fee on the ticket taxable value only (NOT on
    // taxable + ticket GST). Hoizr never charges a fee on govt's GST.
    const applicationFeePaise = pctOfPaise(taxablePaise, input.applicationFeePercent);
    // GST on Hoizr's own platform fee. Hoizr remits this to govt.
    const applicationFeeGstPercent = input.applicationFeeGstPercent ?? 18;
    const platformFeeGstPaise = pctOfPaise(applicationFeePaise, applicationFeeGstPercent);
    const totalPaise = taxablePaise + taxesPaise + applicationFeePaise + platformFeeGstPaise;
    const taxesPercent = taxablePaise > 0
        ? Math.round((taxesPaise / taxablePaise) * 10000) / 100
        : 0;
    // Reconciliation invariant (AUDIT-068): the total must equal the sum of
    // its parts to the exact paise, and the rupee total must map back to the
    // same paise the Razorpay boundary will charge. Integer math guarantees
    // both — this assert is a tripwire against a future refactor breaking it.
    const componentsPaise = taxablePaise + taxesPaise + applicationFeePaise + platformFeeGstPaise;
    const totalAmount = toRupees(totalPaise);
    if (componentsPaise !== totalPaise ||
        Math.round(totalAmount * 100) !== totalPaise) {
        throw new Error(`Cart pricing reconciliation failed: components=${componentsPaise} total=${totalPaise} roundtrip=${Math.round(totalAmount * 100)}`);
    }
    return {
        grossAmount: toRupees(taxablePaise),
        applicationFee: toRupees(applicationFeePaise),
        applicationFeePercent: input.applicationFeePercent,
        platformFeeGst: toRupees(platformFeeGstPaise),
        taxes: toRupees(taxesPaise),
        taxesPercent,
        totalAmount,
    };
};
exports.computeCartPricingForLines = computeCartPricingForLines;
