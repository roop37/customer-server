"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("../../../log/logger");
const customer_schema_1 = require("../../customer/schema/customer.schema");
const event_schema_1 = require("../../event/schema/event.schema");
const FOLLOW_SOURCE = "ticket_purchase";
const dedupePushOps = (bucket, targetIds) => ({
    bucket,
    entries: targetIds.map((targetId) => ({
        targetId,
        source: FOLLOW_SOURCE,
        followedAt: new Date(),
    })),
});
/**
 * On a successful order:
 *   1. Pushes a denormalised EventTicketSale snapshot into Event.eventTicketSales.
 *   2. Auto-follows the host, collaborating businesses, and lineup artists
 *      (including phantoms) from the Customer doc using addToSet semantics
 *      so duplicates don't accumulate on repeat purchases.
 *
 * Runs INSIDE the same transaction as the payment finalisation, so a
 * follow / sales-log failure rolls back the order status flip too.
 */
class PostPurchaseService {
    async applyOrderFollowsAndSalesLog(order, session) {
        let query = event_schema_1.EventModel.findById(order.eventId).select("hostId lineup eventCollaborationBusiness");
        if (session)
            query = query.session(session);
        const event = await query.lean();
        if (!event) {
            logger_1.logger.warn(`Order ${order._id?.toString()} references missing event ${order.eventId}`);
            return;
        }
        await this.pushTicketSale(order, session);
        await this.applyFollows(order, event, session);
    }
    async pushTicketSale(order, session) {
        let customerQuery = customer_schema_1.CustomerModel.findById(order.customerId).select("firstName lastName phone email city");
        if (session)
            customerQuery = customerQuery.session(session);
        const customer = await customerQuery.lean();
        const tickets = (order.tickets ?? []).map((line) => ({
            ticketTypeId: line.ticketTypeId,
            ticketName: line.ticketName,
            quantity: Number(line.quantity ?? 0),
            unitPrice: Number(line.unitPrice ?? 0),
        }));
        const extras = (order.extras ?? []).map((line) => ({
            extraId: line.extraId,
            extraName: line.extraName,
            quantity: Number(line.quantity ?? 0),
            unitPrice: Number(line.unitPrice ?? 0),
        }));
        const ticketCount = tickets.reduce((sum, t) => sum + t.quantity, 0);
        const sale = {
            customerId: order.customerId,
            orderId: order._id?.toString(),
            customerName: customer
                ? [customer.firstName, customer.lastName].filter(Boolean).join(" ") ||
                    undefined
                : order.guestInfo?.firstName
                    ? [order.guestInfo.firstName, order.guestInfo.lastName]
                        .filter(Boolean)
                        .join(" ")
                    : undefined,
            customerPhone: customer?.phone ?? order.guestInfo?.phone,
            customerEmail: customer?.email ?? order.guestInfo?.email,
            customerCity: customer?.city,
            tickets,
            extras: extras.length ? extras : undefined,
            ticketCount,
            grossAmount: Number(order.subtotal ?? 0),
            totalAmount: Number(order.totalAmount ?? 0),
            promoterId: order.promoterId,
            referralCode: order.referralCode,
            purchasedAt: new Date(),
        };
        await event_schema_1.EventModel.updateOne({ _id: order.eventId }, { $push: { eventTicketSales: sale } }, session ? { session } : {});
    }
    async applyFollows(order, event, session) {
        if (!order.customerId)
            return;
        const platformBusinesses = new Set();
        const phantomBusinesses = new Set();
        const platformArtists = new Set();
        const phantomArtists = new Set();
        if (event.hostId)
            platformBusinesses.add(event.hostId);
        for (const collab of event.eventCollaborationBusiness ?? []) {
            if (collab.businessLinkId) {
                platformBusinesses.add(collab.businessLinkId);
            }
            else if (collab.name) {
                phantomBusinesses.add(collab.name);
            }
        }
        for (const artist of event.lineup ?? []) {
            if (artist.artistLinkId) {
                platformArtists.add(artist.artistLinkId);
            }
            else if (artist.tempArtistId) {
                phantomArtists.add(artist.tempArtistId);
            }
            else if (artist.name) {
                phantomArtists.add(artist.name);
            }
        }
        const ops = [
            dedupePushOps("followingBusiness", Array.from(platformBusinesses)),
            dedupePushOps("followingBusinessNotInPlatform", Array.from(phantomBusinesses)),
            dedupePushOps("followingArtist", Array.from(platformArtists)),
            dedupePushOps("followingArtistNotInPlatform", Array.from(phantomArtists)),
        ].filter((op) => op.entries.length > 0);
        if (!ops.length)
            return;
        // Pull existing follow targets per bucket so we don't add duplicates
        // (Mongo's $addToSet doesn't deep-compare embedded subdocs).
        let customerQuery = customer_schema_1.CustomerModel.findById(order.customerId).select("followingBusiness followingBusinessNotInPlatform followingArtist followingArtistNotInPlatform");
        if (session)
            customerQuery = customerQuery.session(session);
        const customer = await customerQuery.lean();
        if (!customer)
            return;
        const existingTargets = (bucket) => {
            const list = customer[bucket] ?? [];
            return new Set(list.map((entry) => entry.targetId));
        };
        const update = {};
        for (const op of ops) {
            const existing = existingTargets(op.bucket);
            const newEntries = op.entries.filter((e) => !existing.has(e.targetId));
            if (newEntries.length) {
                if (!update.$push)
                    update.$push = {};
                update.$push[op.bucket] = { $each: newEntries };
            }
        }
        if (Object.keys(update).length) {
            await customer_schema_1.CustomerModel.updateOne({ _id: order.customerId }, update, session ? { session } : {});
        }
    }
}
exports.default = PostPurchaseService;
