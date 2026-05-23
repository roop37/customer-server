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
const computeCartPricingForLines = (input) => {
    const ticketsGross = input.ticketLines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
    const extrasGross = input.extraLines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
    // Ticket TAXABLE value = sum of ticket face values + extras. This is
    // the base for BOTH the customer-facing platform fee AND the host-side
    // commission. Ticket GST sits ABOVE this and is pass-through to host.
    const ticketTaxableValue = +(ticketsGross + extrasGross).toFixed(2);
    // Ticket GST is only collected when the host is GST-eligible. For
    // ineligible hosts, the ticket face value is final and customer pays
    // no GST line.
    const eligibleForTicketGst = canHostCollectTicketGst(input.host);
    const taxes = eligibleForTicketGst
        ? +input.ticketLines
            .reduce((sum, l) => {
            if (!l.ticketId)
                return sum;
            const ref = input.ticketRefs.get(l.ticketId);
            if (!ref)
                return sum;
            const rate = (0, exports.resolveGstRateForTicket)(ref);
            return sum + l.unitPrice * l.quantity * (rate / 100);
        }, 0)
            .toFixed(2)
        : 0;
    // Customer-facing platform fee on ticket taxable value (NOT on
    // taxable + ticket GST). Hoizr never charges fee on govt's GST.
    const applicationFee = +(ticketTaxableValue * (input.applicationFeePercent / 100)).toFixed(2);
    // GST on Hoizr's own platform fee. Hoizr remits this to govt.
    const applicationFeeGstPercent = input.applicationFeeGstPercent ?? 18;
    const platformFeeGst = +(applicationFee * (applicationFeeGstPercent / 100)).toFixed(2);
    const totalAmount = +(ticketTaxableValue +
        taxes +
        applicationFee +
        platformFeeGst).toFixed(2);
    const taxesPercent = ticketTaxableValue > 0
        ? +((taxes / ticketTaxableValue) * 100).toFixed(2)
        : 0;
    return {
        grossAmount: ticketTaxableValue,
        applicationFee,
        applicationFeePercent: input.applicationFeePercent,
        platformFeeGst,
        taxes,
        taxesPercent,
        totalAmount,
    };
};
exports.computeCartPricingForLines = computeCartPricingForLines;
