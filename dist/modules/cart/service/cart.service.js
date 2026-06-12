"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveGstRateForTicket = void 0;
const shared_1 = require("@hoizr-technology/shared");
const configs_cache_1 = require("../../../utils/configs-cache");
const mercurius_1 = require("mercurius");
const redis_1 = require("../../../utils/redis");
const event_schema_1 = require("../../event/schema/event.schema");
const order_schema_1 = require("../../order/schema/order.schema");
const payout_schema_1 = require("../../payout/schema/payout.schema");
const inventory_math_1 = require("./inventory-math");
const cart_pricing_1 = require("./cart-pricing");
var cart_pricing_2 = require("./cart-pricing");
Object.defineProperty(exports, "resolveGstRateForTicket", { enumerable: true, get: function () { return cart_pricing_2.resolveGstRateForTicket; } });
class CartService {
    async loadActiveLockedQuantities(keys) {
        if (!keys.length)
            return {};
        const values = await redis_1.redisClient.mget(keys);
        const result = {};
        keys.forEach((key, index) => {
            result[key] = Math.max(0, Number(values[index] ?? 0));
        });
        return result;
    }
    async loadPendingOrderQuantities(eventId) {
        const cutoff = new Date(Date.now() - redis_1.RedisKeys.LOCK_TTL_SECONDS * 1000);
        const pending = await order_schema_1.OrderModel.find({
            eventId,
            orderStatus: shared_1.OrderStatus.PAYMENT_PENDING,
            reservedAt: { $gte: cutoff },
        })
            .select("tickets extras")
            .lean();
        const tickets = new Map();
        const extras = new Map();
        for (const order of pending) {
            for (const item of order.tickets ?? []) {
                tickets.set(item.ticketTypeId, (tickets.get(item.ticketTypeId) ?? 0) + Number(item.quantity ?? 0));
            }
            for (const item of order.extras ?? []) {
                extras.set(item.extraId, (extras.get(item.extraId) ?? 0) + Number(item.quantity ?? 0));
            }
        }
        return { tickets, extras };
    }
    async rollbackLockOps(lockOps, ttlSeconds) {
        const changedOps = lockOps.filter((op) => op.delta !== 0);
        if (!changedOps.length)
            return;
        const argv = [String(changedOps.length), String(ttlSeconds)];
        for (const op of changedOps) {
            argv.push(String(Number.MAX_SAFE_INTEGER));
            argv.push(String(-op.delta));
        }
        await redis_1.redisClient.reserveInventory(changedOps.length, ...changedOps.map((op) => op.key), ...argv);
    }
    async assertLatestInventoryStillFits(eventId, ticketIds, extraIds, pendingTickets, pendingExtras) {
        if (!ticketIds.length && !extraIds.length)
            return;
        const latest = await event_schema_1.EventModel.findById(eventId)
            .select("tickets extras maxCapacity")
            .lean();
        if (!latest) {
            throw new mercurius_1.ErrorWithProps("Event not available for booking");
        }
        const latestTicketMap = new Map((latest.tickets ?? []).map((ticket) => [String(ticket._id), ticket]));
        const latestExtraMap = new Map((latest.extras ?? []).map((extra) => [String(extra._id), extra]));
        const keys = [
            ...ticketIds.map((id) => (0, redis_1.ticketLockKey)(eventId, id)),
            ...extraIds.map((id) => (0, redis_1.extraLockKey)(eventId, id)),
        ];
        const currentLocks = await this.loadActiveLockedQuantities(keys);
        for (const ticketId of ticketIds) {
            const ticket = latestTicketMap.get(ticketId);
            if (!ticket)
                throw new mercurius_1.ErrorWithProps(`Unknown ticket: ${ticketId}`);
            const reserved = Math.max(currentLocks[(0, redis_1.ticketLockKey)(eventId, ticketId)] ?? 0, pendingTickets.get(ticketId) ?? 0);
            if (Number(ticket.ticketSold ?? 0) + reserved >
                Number(ticket.ticketCapacity ?? 0)) {
                throw new mercurius_1.ErrorWithProps(`${ticket.ticketName ?? "Ticket"} is no longer available in this quantity`);
            }
        }
        for (const extraId of extraIds) {
            const extra = latestExtraMap.get(extraId);
            if (!extra)
                throw new mercurius_1.ErrorWithProps(`Unknown extra: ${extraId}`);
            const reserved = Math.max(currentLocks[(0, redis_1.extraLockKey)(eventId, extraId)] ?? 0, pendingExtras.get(extraId) ?? 0);
            if (Number(extra.sold ?? 0) + reserved > Number(extra.quantity ?? 0)) {
                throw new mercurius_1.ErrorWithProps(`${extra.name ?? "Add-on"} is no longer available in this quantity`);
            }
        }
        // Venue-wide capacity guard. Per-ticket caps can sum higher than the
        // venue allows (e.g. 100 GA + 50 VIP at a 120-cap venue). After the
        // per-ticket reservation above succeeds, verify the event-wide demand
        // (sold + active locks across every ticket variant) does not exceed
        // event.maxCapacity. Uses post-reservation locks so this customer's
        // contribution is already included.
        const maxCapacity = Number(latest.maxCapacity ?? 0);
        if (maxCapacity > 0) {
            const allTickets = (latest.tickets ?? []);
            const allKeys = allTickets.map((t) => (0, redis_1.ticketLockKey)(eventId, String(t._id)));
            const eventLocks = await this.loadActiveLockedQuantities(allKeys);
            const totalSold = allTickets.reduce((sum, t) => sum + Number(t.ticketSold ?? 0), 0);
            const totalLocked = allTickets.reduce((sum, t) => sum + (eventLocks[(0, redis_1.ticketLockKey)(eventId, String(t._id))] ?? 0), 0);
            if (totalSold + totalLocked > maxCapacity) {
                throw new mercurius_1.ErrorWithProps(`This event has reached its venue capacity of ${maxCapacity}.`);
            }
        }
    }
    async setCart(customerId, input) {
        const event = await event_schema_1.EventModel.findOne({
            _id: input.eventId,
            isDeleted: false,
            isVisible: true,
            status: shared_1.EventStatus.PUBLISHED,
            adminPaused: { $ne: true },
        }).lean();
        if (!event)
            throw new mercurius_1.ErrorWithProps("Event not available for booking");
        if (!event.ticketingEnabled) {
            throw new mercurius_1.ErrorWithProps("Ticketing is not enabled for this event");
        }
        if (!input.tickets?.length) {
            throw new mercurius_1.ErrorWithProps("At least one ticket is required");
        }
        // Time-window guards.
        const now = new Date();
        if (event.ticketSalesStartDate && new Date(event.ticketSalesStartDate) > now) {
            throw new mercurius_1.ErrorWithProps(`Ticket sales open at ${new Date(event.ticketSalesStartDate).toLocaleString()}`);
        }
        if (event.ticketSalesEndDate && new Date(event.ticketSalesEndDate) < now) {
            throw new mercurius_1.ErrorWithProps("Online ticket sales for this event have closed.");
        }
        if (event.endDate && new Date(event.endDate) < now) {
            throw new mercurius_1.ErrorWithProps("This event has already ended.");
        }
        if (event.startDate &&
            new Date(event.startDate) < now &&
            !event.allowWalkIns) {
            throw new mercurius_1.ErrorWithProps("Online booking has closed because the event has already started.");
        }
        const ticketMap = new Map((event.tickets ?? []).map((t) => [String(t._id), t]));
        const extraMap = new Map((event.extras ?? []).map((e) => [String(e._id), e]));
        for (const line of input.tickets) {
            const ticket = ticketMap.get(line.ticketId);
            if (!ticket)
                throw new mercurius_1.ErrorWithProps(`Unknown ticket: ${line.ticketId}`);
            if (!Number.isInteger(line.quantity)) {
                throw new mercurius_1.ErrorWithProps("Quantity must be a whole number");
            }
            if (line.quantity < 0)
                throw new mercurius_1.ErrorWithProps("Quantity cannot be negative");
            if (ticket.markAsOnGroundOnly) {
                throw new mercurius_1.ErrorWithProps(`${ticket.ticketName} is on-ground only`);
            }
            if (ticket.markAsComingSoon) {
                throw new mercurius_1.ErrorWithProps(`${ticket.ticketName} is not yet available`);
            }
            if (ticket.ticketVisible === false) {
                throw new mercurius_1.ErrorWithProps(`${ticket.ticketName} is not visible`);
            }
            if (ticket.ticketExpiryDateTime &&
                new Date(ticket.ticketExpiryDateTime) < now) {
                throw new mercurius_1.ErrorWithProps(`${ticket.ticketName} is no longer on sale`);
            }
            if (ticket.maxTicketPerUser && line.quantity > ticket.maxTicketPerUser) {
                throw new mercurius_1.ErrorWithProps(`${ticket.ticketName} allows max ${ticket.maxTicketPerUser} per user`);
            }
        }
        for (const line of input.extras ?? []) {
            const extra = extraMap.get(line.extraId);
            if (!extra)
                throw new mercurius_1.ErrorWithProps(`Unknown extra: ${line.extraId}`);
            if (!Number.isInteger(line.quantity)) {
                throw new mercurius_1.ErrorWithProps("Quantity must be a whole number");
            }
            if (line.quantity < 0)
                throw new mercurius_1.ErrorWithProps("Quantity cannot be negative");
        }
        const existing = await this.readStoredCart(customerId, input.eventId);
        const reservationStart = existing?.reservedAt
            ? new Date(existing.reservedAt)
            : new Date();
        const reservationExpiresAt = reservationStart.getTime() + redis_1.RedisKeys.CART_TTL_SECONDS * 1000;
        if (existing && reservationExpiresAt <= Date.now()) {
            await this.clearCart(customerId, input.eventId);
            throw new mercurius_1.ErrorWithProps("Your cart has expired. Please reselect your tickets.");
        }
        const existingTicketQty = new Map((existing?.tickets ?? []).map((t) => [t.ticketId, t.quantity]));
        const existingExtraQty = new Map((existing?.extras ?? []).map((e) => [e.extraId, e.quantity]));
        const allTicketIds = new Set([
            ...input.tickets.map((t) => t.ticketId),
            ...existingTicketQty.keys(),
        ]);
        const allExtraIds = new Set([
            ...(input.extras ?? []).map((e) => e.extraId),
            ...existingExtraQty.keys(),
        ]);
        const ticketKeys = Array.from(allTicketIds).map((id) => (0, redis_1.ticketLockKey)(input.eventId, id));
        const extraKeys = Array.from(allExtraIds).map((id) => (0, redis_1.extraLockKey)(input.eventId, id));
        const currentLocks = await this.loadActiveLockedQuantities([
            ...ticketKeys,
            ...extraKeys,
        ]);
        const { tickets: pendingTickets, extras: pendingExtras } = await this.loadPendingOrderQuantities(input.eventId);
        const lockOps = [];
        // The Lua script reads `current` as a raw GET of the Redis lock counter
        // (= total locks across ALL customers, including this customer's prior
        // lock) and checks `current + delta > remaining`. So `remaining` MUST
        // be the absolute upper bound for the counter, NOT a per-customer
        // headroom. Sending a per-customer "remaining" caused valid increases
        // to be rejected near sell-out because the Lua effectively subtracted
        // other customers' locks twice.
        //
        // Bound for the Redis counter:
        //   counter <= capacity - sold - max(0, pendingOrderQty - currentLocked)
        //
        // The `max(0, pendingOrderQty - currentLocked)` term covers the edge
        // case where pending DB orders exist whose Redis lock has already
        // expired (cart TTL ran out but order is still pending) — those have
        // to be subtracted from the available pool too.
        for (const ticketId of allTicketIds) {
            const ticket = ticketMap.get(ticketId);
            const desiredQty = input.tickets.find((t) => t.ticketId === ticketId)?.quantity ?? 0;
            const previousQty = existingTicketQty.get(ticketId) ?? 0;
            const delta = desiredQty - previousQty;
            if (delta === 0 && desiredQty <= 0)
                continue;
            const lockKey = (0, redis_1.ticketLockKey)(input.eventId, ticketId);
            const remaining = (0, inventory_math_1.computeLockRemaining)({
                capacity: Number(ticket.ticketCapacity ?? 0),
                sold: Number(ticket.ticketSold ?? 0),
                currentLocked: currentLocks[lockKey] ?? 0,
                pendingOrderQty: pendingTickets.get(ticketId) ?? 0,
            });
            lockOps.push({ key: lockKey, remaining, delta });
        }
        for (const extraId of allExtraIds) {
            const extra = extraMap.get(extraId);
            const desiredQty = (input.extras ?? []).find((e) => e.extraId === extraId)?.quantity ?? 0;
            const previousQty = existingExtraQty.get(extraId) ?? 0;
            const delta = desiredQty - previousQty;
            if (delta === 0 && desiredQty <= 0)
                continue;
            const lockKey = (0, redis_1.extraLockKey)(input.eventId, extraId);
            const remaining = (0, inventory_math_1.computeLockRemaining)({
                capacity: Number(extra.quantity ?? 0),
                sold: Number(extra.sold ?? 0),
                currentLocked: currentLocks[lockKey] ?? 0,
                pendingOrderQty: pendingExtras.get(extraId) ?? 0,
            });
            lockOps.push({ key: lockKey, remaining, delta });
        }
        // Lock TTL tracks the cart's remaining lifetime, not a fixed 13 min, so
        // stale locks don't outlive the cart they belong to.
        const remainingTtlSeconds = Math.max(1, Math.ceil((reservationExpiresAt - Date.now()) / 1000));
        if (lockOps.length) {
            const argv = [
                String(lockOps.length),
                String(remainingTtlSeconds),
            ];
            for (const op of lockOps) {
                argv.push(String(op.remaining));
                argv.push(String(op.delta));
            }
            const result = (await redis_1.redisClient.reserveInventory(lockOps.length, ...lockOps.map((op) => op.key), ...argv));
            if (Array.isArray(result) && result[0] === 0) {
                throw new mercurius_1.ErrorWithProps("One of the selected items is no longer available in this quantity");
            }
            const selectedTicketIds = input.tickets
                .filter((ticket) => ticket.quantity > 0)
                .map((ticket) => ticket.ticketId);
            const selectedExtraIds = (input.extras ?? [])
                .filter((extra) => extra.quantity > 0)
                .map((extra) => extra.extraId);
            try {
                await this.assertLatestInventoryStillFits(input.eventId, selectedTicketIds, selectedExtraIds, pendingTickets, pendingExtras);
            }
            catch (err) {
                try {
                    await this.rollbackLockOps(lockOps, remainingTtlSeconds);
                }
                catch {
                    // Best-effort rollback. The original availability error is more
                    // useful to the caller, and stale locks still expire with the cart.
                }
                throw err;
            }
        }
        // AUDIT-003: snapshot the price the customer is seeing right now
        // so order-create can reject if the host edits a ticket / extra
        // price between cart-set and checkout. Uses the current DB price
        // (which is also what the customer's UI is about to render via
        // toCartResponse below).
        const eventTicketPriceMap = new Map((event.tickets ?? []).map((t) => [String(t._id), Number(t.ticketPrice ?? 0)]));
        const eventExtraPriceMap = new Map((event.extras ?? []).map((e) => [String(e._id), Number(e.price ?? 0)]));
        const stored = {
            eventId: input.eventId,
            tickets: input.tickets
                .filter((t) => t.quantity > 0)
                .map((t) => ({
                ticketId: t.ticketId,
                quantity: t.quantity,
                unitPriceAtAdd: eventTicketPriceMap.get(t.ticketId),
            })),
            extras: (input.extras ?? [])
                .filter((e) => e.quantity > 0)
                .map((e) => ({
                extraId: e.extraId,
                quantity: e.quantity,
                unitPriceAtAdd: eventExtraPriceMap.get(e.extraId),
            })),
            reservedAt: reservationStart.toISOString(),
        };
        if (!stored.tickets.length && !stored.extras.length) {
            await redis_1.redisClient.del((0, redis_1.cartKey)(customerId, input.eventId));
        }
        else {
            await redis_1.redisClient.setex((0, redis_1.cartKey)(customerId, input.eventId), remainingTtlSeconds, JSON.stringify(stored));
        }
        const [applicationFeePercent, applicationFeeGstPercent, host] = await Promise.all([
            (0, configs_cache_1.getCachedConfigNumber)(shared_1.ConfigTypeEnum.platformFeeOnEvent, 5),
            (0, configs_cache_1.getCachedConfigNumber)(shared_1.ConfigTypeEnum.gstOnPlatformFeeOnEvent, 18),
            this.loadHostGstContext(event.hostId),
        ]);
        return this.toCartResponse(stored, event, applicationFeePercent, applicationFeeGstPercent, host);
    }
    async getCart(customerId, eventId) {
        const stored = await this.readStoredCart(customerId, eventId);
        if (!stored)
            return null;
        const event = await event_schema_1.EventModel.findOne({
            _id: eventId,
            isDeleted: false,
        }).lean();
        if (!event)
            return null;
        const [applicationFeePercent, applicationFeeGstPercent, host] = await Promise.all([
            (0, configs_cache_1.getCachedConfigNumber)(shared_1.ConfigTypeEnum.platformFeeOnEvent, 5),
            (0, configs_cache_1.getCachedConfigNumber)(shared_1.ConfigTypeEnum.gstOnPlatformFeeOnEvent, 18),
            this.loadHostGstContext(event.hostId),
        ]);
        return this.toCartResponse(stored, event, applicationFeePercent, applicationFeeGstPercent, host);
    }
    /**
     * Look up the host's primary verified Payout to determine whether
     * ticket GST may be collected from the customer (see SoT §4). Returns
     * `null` if no primary Payout exists yet — pricing then defaults to
     * "ineligible" (no ticket GST charged), matching the safe-default rule.
     */
    async loadHostGstContext(hostId) {
        if (!hostId)
            return null;
        // Eligibility = primary + verified payout. See the matching guard
        // in OrderService.loadHostGstContextForEvent — keep these two
        // queries in lockstep so the cart preview and order finalisation
        // can never disagree on whether ticket GST is collected.
        const payout = await payout_schema_1.PayoutModel.findOne({
            hostId,
            isPrimary: true,
            isActive: true,
            isDeleted: false,
            verificationStatus: shared_1.VerificationStatus.VERIFIED,
        })
            .select("isGstRegistered gstin gstRegistrationType")
            .lean();
        if (!payout)
            return null;
        return {
            isGstRegistered: payout.isGstRegistered,
            gstin: payout.gstin,
            gstRegistrationType: payout.gstRegistrationType,
        };
    }
    async releaseLocks(eventId, tickets, extras) {
        const ops = [];
        for (const t of tickets) {
            if (t.quantity > 0) {
                ops.push({
                    key: (0, redis_1.ticketLockKey)(eventId, t.ticketId),
                    remaining: Number.MAX_SAFE_INTEGER,
                    delta: -t.quantity,
                });
            }
        }
        for (const e of extras) {
            if (e.quantity > 0) {
                ops.push({
                    key: (0, redis_1.extraLockKey)(eventId, e.extraId),
                    remaining: Number.MAX_SAFE_INTEGER,
                    delta: -e.quantity,
                });
            }
        }
        if (!ops.length)
            return;
        // The reserveInventory Lua script handles negative deltas (release) and
        // clamps the resulting counter at zero, avoiding stale negative values
        // that would otherwise inflate `remaining` on later setCart calls. We
        // pass ttl=0 so a release never extends the lock key's lifetime.
        const argv = [String(ops.length), "0"];
        for (const op of ops) {
            argv.push(String(op.remaining));
            argv.push(String(op.delta));
        }
        await redis_1.redisClient.reserveInventory(ops.length, ...ops.map((op) => op.key), ...argv);
    }
    async clearCart(customerId, eventId) {
        const stored = await this.readStoredCart(customerId, eventId);
        if (!stored)
            return true;
        // Delete the cart row FIRST so the user can't see a ghost cart if
        // releaseLocks throws after a partial apply. Partial locks then
        // decay via TTL — an acceptable failure mode. The previous order
        // (release-then-del) could leave a cart visible with no inventory
        // locks, letting the user try to checkout against capacity they
        // didn't own.
        await redis_1.redisClient.del((0, redis_1.cartKey)(customerId, eventId));
        await this.releaseLocks(eventId, stored.tickets, stored.extras);
        return true;
    }
    /**
     * Called by Order service on successful payment: release the Redis
     * locks. Persistent counters are bumped inside the payment finalisation
     * transaction. Same del-first ordering as clearCart for the same
     * reason.
     */
    async finalizeCartForOrder(customerId, eventId) {
        const stored = await this.readStoredCart(customerId, eventId);
        if (!stored)
            return;
        await redis_1.redisClient.del((0, redis_1.cartKey)(customerId, eventId));
        await this.releaseLocks(eventId, stored.tickets, stored.extras);
    }
    async readStoredCart(customerId, eventId) {
        const raw = await redis_1.redisClient.get((0, redis_1.cartKey)(customerId, eventId));
        if (!raw)
            return null;
        try {
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
    /**
     * Computes the cart pricing including a per-ticket GST sum. GST is
     * driven by each ticket variant's TicketGST enum + optional gstRate
     * — not a single flat env var. Ticket GST is collected ONLY when the
     * `host` snapshot says the host is REGULAR / CASUAL GST-registered
     * (SoT §4 eligibility gate); ineligible hosts always get zero GST.
     * Customer platform fee + its GST come from configs.
     */
    computePricingForLines(ticketLines, extraLines, ticketRefs, applicationFeePercent, applicationFeeGstPercent, host, couponDiscountPaise = 0) {
        return (0, cart_pricing_1.computeCartPricingForLines)({
            ticketLines,
            extraLines,
            ticketRefs,
            applicationFeePercent,
            applicationFeeGstPercent,
            host,
            couponDiscountPaise,
        });
    }
    toCartResponse(stored, event, applicationFeePercent, applicationFeeGstPercent, host) {
        const ticketMap = new Map((event.tickets ?? []).map((t) => [String(t._id), t]));
        const extraMap = new Map((event.extras ?? []).map((e) => [String(e._id), e]));
        const tickets = stored.tickets.map((t) => {
            const ref = ticketMap.get(t.ticketId);
            const unitPrice = Number(ref?.ticketPrice ?? 0);
            return {
                ticketId: t.ticketId,
                ticketName: String(ref?.ticketName ?? "Ticket"),
                quantity: t.quantity,
                unitPrice,
                totalPrice: +(unitPrice * t.quantity).toFixed(2),
            };
        });
        const extras = stored.extras.map((e) => {
            const ref = extraMap.get(e.extraId);
            const unitPrice = Number(ref?.price ?? 0);
            return {
                extraId: e.extraId,
                extraName: String(ref?.name ?? "Add-on"),
                quantity: e.quantity,
                unitPrice,
                totalPrice: +(unitPrice * e.quantity).toFixed(2),
            };
        });
        const ticketRefs = new Map((event.tickets ?? []).map((t) => [
            String(t._id),
            { ticketGST: t.ticketGST, gstRate: t.gstRate },
        ]));
        const reservedAt = new Date(stored.reservedAt);
        const expiresAt = new Date(reservedAt.getTime() + redis_1.RedisKeys.CART_TTL_SECONDS * 1000);
        return {
            eventId: stored.eventId,
            tickets,
            extras,
            pricing: this.computePricingForLines(tickets.map((t) => ({
                ticketId: t.ticketId,
                quantity: t.quantity,
                unitPrice: t.unitPrice,
            })), extras.map((e) => ({
                quantity: e.quantity,
                unitPrice: e.unitPrice,
            })), ticketRefs, applicationFeePercent, applicationFeeGstPercent, host),
            reservedAt,
            expiresAt,
        };
    }
}
exports.default = CartService;
