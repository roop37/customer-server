"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const shared_1 = require("@hoizr-technology/shared");
const configs_cache_1 = require("../../../utils/configs-cache");
const typegoose_1 = require("@typegoose/typegoose");
const bullmq_1 = require("bullmq");
const mercurius_1 = require("mercurius");
const qr_hash_1 = require("../../../utils/qr-hash");
const lifecycle_queue_1 = require("../../../utils/lifecycle.queue");
const razorpay_client_1 = require("../../../utils/razorpay.client");
const redis_1 = require("../../../utils/redis");
const validations_1 = require("../../../utils/validations");
const cart_service_1 = __importDefault(require("../../cart/service/cart.service"));
const customer_schema_1 = require("../../customer/schema/customer.schema");
const event_schema_1 = require("../../event/schema/event.schema");
const payout_schema_1 = require("../../payout/schema/payout.schema");
const order_schema_1 = require("../schema/order.schema");
const offline_order_schema_1 = require("../schema/offline-order.schema");
const shared_2 = require("@hoizr-technology/shared");
const customer_resolution_service_1 = require("../../customer/service/customer-resolution.service");
const invoice_schema_1 = require("../schema/invoice.schema");
const cloudinary_1 = require("../../../utils/cloudinary");
const shared_3 = require("@hoizr-technology/shared");
const postPurchaseQueue = new bullmq_1.Queue(shared_1.QueueNames.postPurchaseQueue, {
    connection: redis_1.redisClient,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: true,
        removeOnFail: 50,
    },
});
const soldOutTriggerQueue = new bullmq_1.Queue(shared_1.QueueNames.soldOutTriggerQueue, {
    connection: redis_1.redisClient,
    defaultJobOptions: {
        attempts: 2,
        removeOnComplete: true,
        removeOnFail: 50,
    },
});
const lifecycleSmsQueue = new bullmq_1.Queue(shared_1.QueueNames.smsQueue, {
    connection: redis_1.redisClient,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: true,
        removeOnFail: 50,
    },
});
class OrderService {
    constructor() {
        this.cart = new cart_service_1.default();
    }
    /**
     * Same GST-eligibility lookup as cart.service.loadHostGstContext, scoped
     * here so finalizeOrder / createOrder have access without piping it
     * through. Returns null when no primary verified Payout exists — pricing
     * then defaults to "ineligible" (no ticket GST charged).
     */
    async loadHostGstContextForEvent(event) {
        const hostId = event?.hostId;
        if (!hostId)
            return null;
        // Eligibility = primary + VERIFIED payout. Unverified rows may
        // carry a placeholder GSTIN entered during KYC intake — charging
        // customers ticket GST against that would be a tax-compliance
        // issue. Once admin marks the payout VERIFIED the eligibility
        // flips on automatically.
        const payout = await payout_schema_1.PayoutModel.findOne({
            hostId,
            isPrimary: true,
            isActive: true,
            isDeleted: false,
            verificationStatus: shared_1.VerificationStatus.VERIFIED,
        })
            .select("isGstRegistered gstin gstRegistrationType registeredStateCode")
            .lean();
        if (!payout)
            return null;
        return {
            isGstRegistered: payout.isGstRegistered,
            gstin: payout.gstin,
            gstRegistrationType: payout.gstRegistrationType,
            registeredStateCode: payout.registeredStateCode,
        };
    }
    /**
     * Build the immutable config snapshot stored on every Order. Reads of
     * `order.appliedConfigSnapshot` are how every downstream consumer
     * (refund pro-ration, settlement math, invoice regeneration) computes
     * historically-correct totals — even if an admin later edits the
     * underlying SoT configs.
     */
    buildConfigSnapshot(input) {
        const eligible = !!(input.host?.isGstRegistered &&
            input.host?.gstin &&
            (input.host?.gstRegistrationType === "REGULAR" ||
                input.host?.gstRegistrationType === "CASUAL_TAXABLE_PERSON"));
        // AUDIT-007: lock AI Boost amount + mode at order creation so the
        // settlement reads from the order snapshot (immutable per order)
        // instead of the live Event document (mutable mid-event).
        const aiBoostFeeRupees = Math.max(0, Number(input.aiBoost?.feeRupees ?? 0));
        const aiBoostFeeGstPercent = Math.max(0, Number(input.aiBoost?.gstPercent ?? 0));
        const aiBoostFeePaise = Math.round(aiBoostFeeRupees * 100);
        const aiBoostFeeGstPaise = Math.round(aiBoostFeeRupees * (aiBoostFeeGstPercent / 100) * 100);
        return {
            platformFeePercent: input.platformFeePercent,
            platformFeeGstPercent: input.platformFeeGstPercent,
            ticketGstPercent: input.ticketGstPercent,
            hoizrCommissionPercent: input.hoizrCommissionPercent,
            hoizrCommissionGstPercent: input.hoizrCommissionGstPercent,
            hostTicketGstEligible: eligible,
            hostGstin: input.host?.gstin ?? undefined,
            hostStateCode: input.host?.registeredStateCode ?? undefined,
            currency: "INR",
            aiBoostFeePaise,
            aiBoostFeeGstPaise,
            aiBoostAdjustmentMode: input.aiBoost?.adjustmentMode,
            aiBoostOfferId: input.aiBoost?.offerId,
            capturedAt: new Date(),
        };
    }
    generateQrPayload(orderId, paymentId) {
        const payload = `hoizr:${orderId}:${paymentId}`;
        // AUDIT-023: versioned signing — see utils/qr-hash.ts.
        const { hash, version } = (0, qr_hash_1.signQrPayload)(payload);
        return { payload, hash, version };
    }
    assertCartReservationActive(reservedAt) {
        const reservedAtDate = new Date(reservedAt);
        if (Number.isNaN(reservedAtDate.getTime()) ||
            reservedAtDate.getTime() + redis_1.RedisKeys.CART_TTL_SECONDS * 1000 <= Date.now()) {
            throw new mercurius_1.ErrorWithProps("Cart is empty or expired");
        }
        return reservedAtDate;
    }
    assertEventBookable(event) {
        const now = new Date();
        if (!event.ticketingEnabled) {
            throw new mercurius_1.ErrorWithProps("Ticketing is not enabled for this event");
        }
        if (event.ticketSalesStartDate && new Date(event.ticketSalesStartDate) > now) {
            throw new mercurius_1.ErrorWithProps("Ticket sales are not open yet");
        }
        if (event.ticketSalesEndDate && new Date(event.ticketSalesEndDate) < now) {
            throw new mercurius_1.ErrorWithProps("Online ticket sales for this event have closed.");
        }
        if (event.endDate && new Date(event.endDate) < now) {
            throw new mercurius_1.ErrorWithProps("This event has already ended.");
        }
        if (event.startDate && new Date(event.startDate) < now && !event.allowWalkIns) {
            throw new mercurius_1.ErrorWithProps("Online booking has closed because the event has already started.");
        }
    }
    async reusablePendingOrder(customerId, eventId, reservedAt, totalAmount, tickets, extras) {
        const pending = await order_schema_1.OrderModel.findOne({
            customerId,
            eventId,
            reservedAt,
            orderStatus: shared_1.OrderStatus.PAYMENT_PENDING,
            isDeleted: false,
        }).sort({ createdAt: -1 });
        if (!pending)
            return null;
        // Compare in paise to dodge float-equality hazards: 12.34 stored as
        // 12.340000000001 used to fail strict !== against the recomputed
        // value and trigger a duplicate Order row + Razorpay order.
        const pendingPaise = Math.round(Number(pending.totalAmount ?? 0) * 100);
        const desiredPaise = Math.round(totalAmount * 100);
        if (pendingPaise !== desiredPaise)
            return null;
        const sameTickets = (pending.tickets ?? []).length === tickets.length &&
            tickets.every((line) => (pending.tickets ?? []).some((existing) => existing.ticketTypeId === line.ticketTypeId &&
                Number(existing.quantity ?? 0) === line.quantity));
        const sameExtras = (pending.extras ?? []).length === extras.length &&
            extras.every((line) => (pending.extras ?? []).some((existing) => existing.extraId === line.extraId &&
                Number(existing.quantity ?? 0) === line.quantity));
        return sameTickets && sameExtras ? pending : null;
    }
    /**
     * AUDIT-030: customer is bounced back to /checkout?retryOrderId=… from
     * the order detail page for a PaymentPending order. Instead of
     * creating a brand-new order + Razorpay order (which can race against
     * the original capture and double-charge), reuse the existing pending
     * order and re-issue its Razorpay checkout payload. ensureRazorpayOrder
     * already returns the existing Razorpay order if the amount hasn't
     * drifted, and re-issues a fresh one if it has — so the customer is
     * never charged the wrong amount.
     */
    async reusePendingOrder(customerId, orderId) {
        const order = await order_schema_1.OrderModel.findOne({
            _id: orderId,
            customerId,
            isDeleted: false,
            orderStatus: shared_1.OrderStatus.PAYMENT_PENDING,
        });
        if (!order) {
            throw new mercurius_1.ErrorWithProps("This order can't be resumed. It may have been completed, cancelled, or expired.");
        }
        // Defend against silent stale-price charging: if any ticket/extra
        // price on the event has moved since the order was created, the
        // customer would be paying the stale (snapshotted) amount even
        // though the visible event price has changed. Force a rebuild so
        // they explicitly agree to the new total. Mirrors the AUDIT-003
        // guard on cart → order create.
        await this.assertPendingOrderPriceStillValid(order);
        const checkout = await this.ensureRazorpayOrder(order, String(order.eventId), customerId, Number(order.totalAmount ?? 0));
        return { order: order.toObject(), checkout };
    }
    async assertPendingOrderPriceStillValid(order) {
        const event = await event_schema_1.EventModel.findById(order.eventId)
            .select("tickets extras")
            .lean();
        if (!event) {
            throw new mercurius_1.ErrorWithProps("Event no longer available — please rebuild your cart.");
        }
        const ticketMap = new Map((event.tickets ?? []).map((t) => [String(t._id), t]));
        const extraMap = new Map((event.extras ?? []).map((e) => [String(e._id), e]));
        let liveSubtotalPaise = 0;
        for (const line of order.tickets ?? []) {
            const ref = ticketMap.get(String(line.ticketTypeId));
            if (!ref) {
                throw new mercurius_1.ErrorWithProps(`${line.ticketName ?? "A ticket"} is no longer available — please rebuild your cart.`);
            }
            liveSubtotalPaise +=
                Math.round(Number(ref.ticketPrice ?? 0) * 100) *
                    Number(line.quantity ?? 0);
        }
        for (const line of order.extras ?? []) {
            const ref = extraMap.get(String(line.extraId));
            if (!ref) {
                throw new mercurius_1.ErrorWithProps(`${line.extraName ?? "An add-on"} is no longer available — please rebuild your cart.`);
            }
            liveSubtotalPaise +=
                Math.round(Number(ref.price ?? 0) * 100) *
                    Number(line.quantity ?? 0);
        }
        const orderSubtotalPaise = Math.round(Number(order.subtotal ?? 0) * 100);
        if (orderSubtotalPaise !== liveSubtotalPaise) {
            throw new mercurius_1.ErrorWithProps("Prices have changed since this order was started — please rebuild your cart with the current prices.");
        }
    }
    async ensureRazorpayOrder(order, eventId, customerId, amount) {
        const orderId = String(order._id);
        const amountPaise = Math.round(amount * 100);
        if (order.razorpayOrderId) {
            // Razorpay locks `amount` at order-creation time. If the recomputed
            // cart total drifted since we issued the existing Razorpay order
            // (config edit or host edit), we MUST issue a fresh one — otherwise
            // the customer pays one amount and our books record another.
            const storedAmountPaise = Math.round(Number(order.totalAmount ?? 0) * 100);
            if (storedAmountPaise === amountPaise) {
                return {
                    razorpayOrderId: order.razorpayOrderId,
                    razorpayKeyId: (0, razorpay_client_1.getRazorpayPayments)().keyId,
                    amount,
                    currency: "INR",
                    orderId,
                };
            }
            await order_schema_1.OrderModel.updateOne({ _id: order._id }, { $unset: { razorpayOrderId: "" } });
            order.razorpayOrderId = undefined;
        }
        const razorpay = (0, razorpay_client_1.getRazorpayPayments)();
        const rzpOrder = await razorpay.createOrder({
            amountPaise,
            currency: "INR",
            receipt: orderId,
            notes: { orderId, eventId, customerId },
        });
        await order_schema_1.OrderModel.updateOne({ _id: order._id }, { $set: { razorpayOrderId: rzpOrder.id } });
        order.razorpayOrderId = rzpOrder.id;
        return {
            razorpayOrderId: rzpOrder.id,
            razorpayKeyId: razorpay.keyId,
            amount,
            currency: "INR",
            orderId,
        };
    }
    async supersedeSiblingPendingOrders(customerId, eventId, winningOrderId, session) {
        await order_schema_1.OrderModel.updateMany({
            _id: { $ne: winningOrderId },
            customerId,
            eventId,
            orderStatus: shared_1.OrderStatus.PAYMENT_PENDING,
            isDeleted: false,
        }, {
            $set: {
                orderStatus: shared_1.OrderStatus.SUPERSEDED,
                "paymentMeta.supersededByOrderId": winningOrderId,
                "paymentMeta.supersededAt": new Date(),
            },
        }, session ? { session } : undefined);
    }
    async finalizeFreeOrder(customerId, event, input, orderTickets, orderExtras, pricing, reservedAt, appliedConfigSnapshot) {
        const session = await typegoose_1.mongoose.startSession();
        let createdOrder = null;
        try {
            await session.withTransaction(async () => {
                const latestEvent = await event_schema_1.EventModel.findById(event._id)
                    .select("tickets extras")
                    .session(session)
                    .lean();
                if (!latestEvent) {
                    throw new mercurius_1.ErrorWithProps("Event not available for booking");
                }
                const latestTickets = new Map((latestEvent.tickets ?? []).map((ticket) => [
                    String(ticket._id),
                    ticket,
                ]));
                for (const line of orderTickets) {
                    const ticket = latestTickets.get(line.ticketTypeId);
                    if (!ticket ||
                        Number(ticket.ticketSold ?? 0) + Number(line.quantity ?? 0) >
                            Number(ticket.ticketCapacity ?? 0)) {
                        throw new mercurius_1.ErrorWithProps(`${line.ticketName ?? "Ticket"} is no longer available in this quantity`);
                    }
                }
                const latestExtras = new Map((latestEvent.extras ?? []).map((extra) => [
                    String(extra._id),
                    extra,
                ]));
                for (const line of orderExtras) {
                    const extra = latestExtras.get(line.extraId);
                    if (!extra ||
                        Number(extra.sold ?? 0) + Number(line.quantity ?? 0) >
                            Number(extra.quantity ?? 0)) {
                        throw new mercurius_1.ErrorWithProps(`${line.extraName ?? "Add-on"} is no longer available in this quantity`);
                    }
                }
                const order = new order_schema_1.OrderModel({
                    customerId,
                    guestInfo: input.guestInfo,
                    eventId: event._id.toString(),
                    businessId: event.hostId,
                    tickets: orderTickets,
                    extras: orderExtras,
                    subtotal: pricing.grossAmount,
                    platformFee: pricing.applicationFee,
                    platformFeeGst: pricing.platformFeeGst,
                    totalAmount: pricing.totalAmount,
                    applicationFeePercent: pricing.applicationFeePercent,
                    taxes: pricing.taxes,
                    taxesPercent: pricing.taxesPercent,
                    hoizrCommission: 0,
                    hoizrCommissionPercent: 0,
                    razorpayFee: 0,
                    finalDeclaredCommission: 0,
                    finalDeclaredOfferAmount: 0,
                    appliedConfigSnapshot,
                    orderStatus: shared_1.OrderStatus.PAYMENT_SUCCESS,
                    reservedAt,
                    utm: input.utm,
                    pageQuery: input.pageQuery,
                    promoterId: input.promoterId,
                    referralCode: input.referralCode,
                });
                const paymentId = `free_${order._id.toString()}`;
                const qr = this.generateQrPayload(order._id.toString(), paymentId);
                order.razorpayPaymentId = paymentId;
                order.qrCodeData = qr.payload;
                order.qrCodeHash = qr.hash;
                order.qrHashVersion = qr.version;
                await order.save({ session });
                const ticketOps = orderTickets.map((line) => ({
                    updateOne: {
                        filter: { _id: event._id, "tickets._id": line.ticketTypeId },
                        update: { $inc: { "tickets.$.ticketSold": line.quantity } },
                    },
                }));
                const extraOps = orderExtras.map((line) => ({
                    updateOne: {
                        filter: { _id: event._id, "extras._id": line.extraId },
                        update: { $inc: { "extras.$.sold": line.quantity } },
                    },
                }));
                if (ticketOps.length || extraOps.length) {
                    await event_schema_1.EventModel.bulkWrite([...ticketOps, ...extraOps], { session });
                }
                const now = new Date();
                await event_schema_1.EventModel.updateOne({ _id: event._id, firstSaleAt: { $exists: false } }, { $set: { firstSaleAt: now } }, { session });
                await event_schema_1.EventModel.updateOne({ _id: event._id }, { $set: { lastSaleAt: now } }, { session });
                await this.supersedeSiblingPendingOrders(customerId, event._id.toString(), order._id.toString(), session);
                createdOrder = order.toObject();
            });
        }
        finally {
            await session.endSession();
        }
        await this.cart.finalizeCartForOrder(customerId, event._id.toString());
        if (createdOrder?._id) {
            await postPurchaseQueue.add("APPLY_FOLLOWS_AND_SALES_LOG", {
                orderId: createdOrder._id.toString(),
            });
            await soldOutTriggerQueue.add("CHECK_AFTER_SALE", {
                eventId: event._id.toString(),
            });
            await this.dispatchOrderConfirmationComms(createdOrder);
        }
        return createdOrder;
    }
    /**
     * Guest checkout: a not-logged-in buyer places an order with just their
     * contact details + selected tickets. Phone is the identity — if an
     * account already exists we attach the order to it (and the client shows
     * "we found your account"); otherwise we auto-create a PHONE account so the
     * tickets live somewhere they can later log into. `guestInfo` is always
     * stored so guest purchases are countable. Reuses the EXACT online order
     * flow (seed cart → createOrder), so no money-path logic is duplicated.
     */
    async createGuestOrder(input) {
        if (!input.tickets?.length && !input.extras?.length) {
            throw new mercurius_1.ErrorWithProps("Select at least one ticket");
        }
        const resolved = await (0, customer_resolution_service_1.resolveCustomerForOrder)({
            phone: input.phone,
            email: input.email,
            firstName: input.firstName,
            lastName: input.lastName,
            createIfMissing: true,
        });
        if (!resolved.customerId) {
            throw new mercurius_1.ErrorWithProps("Couldn't start checkout — please check your name, email and phone.");
        }
        // Marketing opt-in applies only to a freshly created account (don't flip
        // an existing customer's preference from a guest purchase).
        if (resolved.created && input.notifyMe !== false) {
            await customer_schema_1.CustomerModel.updateOne({ _id: resolved.customerId }, { $set: { emailMarketingOptIn: true, whatsappMarketingOptIn: true } });
        }
        // Seed the cart for this customer, then run the normal order flow.
        await this.cart.setCart(resolved.customerId, {
            eventId: input.eventId,
            tickets: input.tickets,
            extras: input.extras ?? [],
        });
        const result = await this.createOrder(resolved.customerId, {
            eventId: input.eventId,
            guestInfo: {
                firstName: input.firstName,
                lastName: input.lastName,
                email: input.email,
                phone: input.phone,
            },
            utm: input.utm,
            pageQuery: input.pageQuery,
            referralCode: input.referralCode,
            promoterId: input.promoterId,
        });
        // Offline payment link → link the created order to its OfflineOrder
        // exactly (no fuzzy matching). The OfflineOrder flips to PAID when the
        // order finalises (post-purchase worker reads Order.offlineOrderId).
        if (input.offlineOrderId && result.order?._id) {
            await order_schema_1.OrderModel.updateOne({ _id: result.order._id }, {
                $set: { offlineOrderId: input.offlineOrderId, source: "OFFLINE_LINK" },
            });
        }
        return {
            result,
            accountFound: resolved.existed,
            accountEmail: resolved.existed ? resolved.accountEmail : undefined,
        };
    }
    /**
     * Resolve a host's offline payment-link short code → prefill payload for the
     * customer checkout (hoizr.com/t/<code>). Public; returns enough to render a
     * locked, prefilled order. `alreadyPaid`/`expired` let the page show the
     * right state instead of letting a stale link double-charge.
     */
    async resolveOfflinePaymentLink(shortCode) {
        if (!shortCode || !/^[A-Za-z0-9_-]{4,40}$/.test(shortCode)) {
            throw new mercurius_1.ErrorWithProps("Invalid link");
        }
        const offline = await offline_order_schema_1.OfflineOrderModel.findOne({
            shortCode,
            mode: shared_2.OfflineOrderMode.PAYMENT_LINK,
            isDeleted: { $ne: true },
        }).lean();
        if (!offline)
            throw new mercurius_1.ErrorWithProps("This link is no longer valid");
        const event = await event_schema_1.EventModel.findById(offline.eventId)
            .select("title slug eventFlyer horizontalFlyer")
            .lean();
        const alreadyPaid = offline.status === "PAID" || !!offline.linkedOrderId;
        const expired = !!offline.linkExpiresAt && new Date(offline.linkExpiresAt) < new Date();
        return {
            offlineOrderId: String(offline._id),
            eventId: String(offline.eventId),
            eventTitle: event?.title,
            eventFlyer: event?.horizontalFlyer || event?.eventFlyer,
            eventSlug: event?.slug,
            lines: (offline.lines ?? []).map((l) => ({
                itemId: l.itemId,
                name: l.name,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                isExtra: !!l.isExtra,
            })),
            amountTotal: offline.amountTotal ?? 0,
            customerFirstName: offline.customerFirstName,
            customerLastName: offline.customerLastName,
            customerEmail: offline.customerEmail,
            customerPhone: offline.customerPhone,
            alreadyPaid,
            expired,
        };
    }
    /**
     * Offline-ticket feature: create a real, scannable Order for a host-issued
     * offline ticket. Called ONLY by the HMAC-authed internal route (the host
     * isn't a customer, so main-server brokers it). Reuses the exact same
     * pricing + inventory + QR + fan-out path as an online order, so accounting
     * and the door experience are identical — just no Razorpay leg. Guest order
     * (no customerId); links back via `OfflineOrder.issuedOrderId`. Idempotent.
     */
    async createIssuedOfflineOrder(offlineOrderId) {
        if (!(0, validations_1.isAlphanumeric)(offlineOrderId)) {
            throw new mercurius_1.ErrorWithProps("Invalid offline order id");
        }
        const offline = await offline_order_schema_1.OfflineOrderModel.findById(offlineOrderId).lean();
        if (!offline)
            throw new mercurius_1.ErrorWithProps("Offline order not found");
        if (offline.mode !== shared_2.OfflineOrderMode.ISSUED) {
            throw new mercurius_1.ErrorWithProps("Not an issued offline order");
        }
        if (offline.issuedOrderId) {
            return { orderId: String(offline.issuedOrderId) }; // idempotent
        }
        const event = await event_schema_1.EventModel.findById(offline.eventId).lean();
        if (!event)
            throw new mercurius_1.ErrorWithProps("Event not found");
        const ticketMap = new Map((event.tickets ?? []).map((t) => [String(t._id), t]));
        const extraMap = new Map((event.extras ?? []).map((e) => [String(e._id), e]));
        const orderTickets = [];
        const orderExtras = [];
        for (const line of offline.lines ?? []) {
            if (line.isExtra) {
                const ref = extraMap.get(String(line.itemId));
                if (!ref)
                    throw new mercurius_1.ErrorWithProps(`Add-on not available: ${line.name}`);
                const available = Number(ref.quantity ?? 0) - Number(ref.sold ?? 0);
                if (line.quantity > available) {
                    throw new mercurius_1.ErrorWithProps(`${ref.name ?? line.name} is sold out`);
                }
                const unitPrice = Number(ref.price ?? line.unitPrice ?? 0);
                orderExtras.push({
                    extraId: String(line.itemId),
                    extraName: String(ref.name ?? line.name),
                    quantity: line.quantity,
                    unitPrice,
                    totalPrice: +(unitPrice * line.quantity).toFixed(2),
                });
            }
            else {
                const ref = ticketMap.get(String(line.itemId));
                if (!ref)
                    throw new mercurius_1.ErrorWithProps(`Ticket not available: ${line.name}`);
                const remaining = Number(ref.ticketCapacity ?? 0) - Number(ref.ticketSold ?? 0);
                if (line.quantity > remaining) {
                    throw new mercurius_1.ErrorWithProps(`${ref.ticketName ?? line.name} is sold out`);
                }
                const unitPrice = Number(ref.ticketPrice ?? line.unitPrice ?? 0);
                orderTickets.push({
                    ticketTypeId: String(line.itemId),
                    ticketName: String(ref.ticketName ?? line.name),
                    quantity: line.quantity,
                    unitPrice,
                    totalPrice: +(unitPrice * line.quantity).toFixed(2),
                });
            }
        }
        if (!orderTickets.length && !orderExtras.length) {
            throw new mercurius_1.ErrorWithProps("Offline order has no valid lines");
        }
        const ticketRefs = new Map((event.tickets ?? []).map((t) => [
            String(t._id),
            { ticketGST: t.ticketGST, gstRate: t.gstRate },
        ]));
        const [applicationFeePercent, applicationFeeGstPercent, hoizrCommissionGstPercent, host,] = await Promise.all([
            (0, configs_cache_1.getCachedConfigNumber)(shared_1.ConfigTypeEnum.platformFeeOnEvent, 5),
            (0, configs_cache_1.getCachedConfigNumber)(shared_1.ConfigTypeEnum.gstOnPlatformFeeOnEvent, 18),
            (0, configs_cache_1.getCachedConfigNumber)(shared_1.ConfigTypeEnum.gstOnComission, 18),
            this.loadHostGstContextForEvent(event),
        ]);
        const pricing = this.cart.computePricingForLines(orderTickets.map((t) => ({
            ticketId: t.ticketTypeId,
            quantity: t.quantity,
            unitPrice: t.unitPrice,
        })), orderExtras.map((e) => ({ quantity: e.quantity, unitPrice: e.unitPrice })), ticketRefs, applicationFeePercent, applicationFeeGstPercent, host);
        const selectedPlan = event.pricingSnapshot;
        const aiCommissionPct = typeof event.aiSelectedCommissionPct === "number"
            ? event.aiSelectedCommissionPct
            : undefined;
        let hoizrCommissionPercent;
        if (typeof aiCommissionPct === "number") {
            hoizrCommissionPercent = aiCommissionPct;
        }
        else if (selectedPlan) {
            hoizrCommissionPercent = Number(selectedPlan.commissionRate ?? 0);
        }
        else {
            throw new mercurius_1.ErrorWithProps("Event is not priced: select a pricing plan before issuing tickets.");
        }
        const aiBoostFeeRupees = Number(event.aiSelectedExtraAmount ?? selectedPlan?.upfrontFee ?? 0);
        const aiBoostGstPercent = await (0, configs_cache_1.getCachedConfigNumber)(shared_1.ConfigTypeEnum.gstOnAiBoost, 18);
        const appliedConfigSnapshot = this.buildConfigSnapshot({
            platformFeePercent: applicationFeePercent,
            platformFeeGstPercent: applicationFeeGstPercent,
            hoizrCommissionPercent,
            hoizrCommissionGstPercent,
            ticketGstPercent: pricing.taxesPercent,
            host,
            aiBoost: aiBoostFeeRupees > 0
                ? {
                    feeRupees: aiBoostFeeRupees,
                    gstPercent: aiBoostGstPercent,
                    adjustmentMode: event.feeSettlementMode,
                    offerId: event.selectedAiBoostGenerationId,
                }
                : undefined,
        });
        // If a customer already exists for this phone/email, attach the order to
        // their account (don't auto-create for an offline issue — the buyer
        // didn't opt in). guestInfo is always recorded too.
        const resolved = await (0, customer_resolution_service_1.resolveCustomerForOrder)({
            phone: offline.customerPhone,
            email: offline.customerEmail,
            createIfMissing: false,
        });
        const session = await typegoose_1.mongoose.startSession();
        let createdOrder = null;
        try {
            await session.withTransaction(async () => {
                const latestEvent = await event_schema_1.EventModel.findById(event._id)
                    .select("tickets extras")
                    .session(session)
                    .lean();
                if (!latestEvent)
                    throw new mercurius_1.ErrorWithProps("Event not available");
                const lt = new Map((latestEvent.tickets ?? []).map((t) => [String(t._id), t]));
                for (const line of orderTickets) {
                    const t = lt.get(line.ticketTypeId);
                    if (!t ||
                        Number(t.ticketSold ?? 0) + line.quantity >
                            Number(t.ticketCapacity ?? 0)) {
                        throw new mercurius_1.ErrorWithProps(`${line.ticketName} is sold out`);
                    }
                }
                const le = new Map((latestEvent.extras ?? []).map((e) => [String(e._id), e]));
                for (const line of orderExtras) {
                    const e = le.get(line.extraId);
                    if (!e ||
                        Number(e.sold ?? 0) + line.quantity > Number(e.quantity ?? 0)) {
                        throw new mercurius_1.ErrorWithProps(`${line.extraName} is sold out`);
                    }
                }
                const order = new order_schema_1.OrderModel({
                    customerId: resolved.customerId,
                    guestInfo: {
                        firstName: offline.customerFirstName,
                        lastName: offline.customerLastName,
                        email: offline.customerEmail,
                        phone: offline.customerPhone,
                    },
                    eventId: String(event._id),
                    businessId: event.hostId,
                    tickets: orderTickets,
                    extras: orderExtras,
                    subtotal: pricing.grossAmount,
                    platformFee: pricing.applicationFee,
                    platformFeeGst: pricing.platformFeeGst,
                    totalAmount: pricing.totalAmount,
                    applicationFeePercent: pricing.applicationFeePercent,
                    taxes: pricing.taxes,
                    taxesPercent: pricing.taxesPercent,
                    hoizrCommission: 0,
                    hoizrCommissionPercent,
                    razorpayFee: 0,
                    finalDeclaredCommission: 0,
                    finalDeclaredOfferAmount: 0,
                    appliedConfigSnapshot,
                    orderStatus: shared_1.OrderStatus.PAYMENT_SUCCESS,
                    reservedAt: new Date(),
                    source: "OFFLINE_ISSUED",
                    offlineOrderId: String(offline._id),
                });
                const paymentId = `offline_${order._id.toString()}`;
                const qr = this.generateQrPayload(order._id.toString(), paymentId);
                order.razorpayPaymentId = paymentId;
                order.qrCodeData = qr.payload;
                order.qrCodeHash = qr.hash;
                order.qrHashVersion = qr.version;
                await order.save({ session });
                const ticketOps = orderTickets.map((line) => ({
                    updateOne: {
                        filter: { _id: event._id, "tickets._id": line.ticketTypeId },
                        update: { $inc: { "tickets.$.ticketSold": line.quantity } },
                    },
                }));
                const extraOps = orderExtras.map((line) => ({
                    updateOne: {
                        filter: { _id: event._id, "extras._id": line.extraId },
                        update: { $inc: { "extras.$.sold": line.quantity } },
                    },
                }));
                if (ticketOps.length || extraOps.length) {
                    await event_schema_1.EventModel.bulkWrite([...ticketOps, ...extraOps], { session });
                }
                const now = new Date();
                await event_schema_1.EventModel.updateOne({ _id: event._id, firstSaleAt: { $exists: false } }, { $set: { firstSaleAt: now } }, { session });
                await event_schema_1.EventModel.updateOne({ _id: event._id }, { $set: { lastSaleAt: now } }, { session });
                // Claim the offline order → this order. The {issuedOrderId:$exists:false}
                // guard makes a concurrent retry abort (modifiedCount 0 → throw →
                // rollback) so we never double-issue.
                const claim = await offline_order_schema_1.OfflineOrderModel.updateOne({ _id: offline._id, issuedOrderId: { $exists: false } }, { $set: { issuedOrderId: String(order._id) } }, { session });
                if (claim.modifiedCount !== 1) {
                    throw new mercurius_1.ErrorWithProps("This offline order was already issued.");
                }
                createdOrder = order.toObject();
            });
        }
        finally {
            await session.endSession();
        }
        if (createdOrder?._id) {
            await postPurchaseQueue.add("APPLY_FOLLOWS_AND_SALES_LOG", {
                orderId: createdOrder._id.toString(),
            });
            await soldOutTriggerQueue.add("CHECK_AFTER_SALE", {
                eventId: String(event._id),
            });
            await this.dispatchOrderConfirmationComms(createdOrder);
        }
        return { orderId: String(createdOrder._id) };
    }
    async dispatchOrderConfirmationComms(order) {
        const customer = order.customerId
            ? await customer_schema_1.CustomerModel.findById(order.customerId)
                .select("firstName lastName email phone")
                .lean()
            : null;
        const recipientEmail = customer?.email ?? order.guestInfo?.email ?? "";
        const recipientPhone = customer?.phone ?? order.guestInfo?.phone ?? "";
        const recipientName = [customer?.firstName, customer?.lastName].filter(Boolean).join(" ") ||
            [order.guestInfo?.firstName, order.guestInfo?.lastName]
                .filter(Boolean)
                .join(" ");
        if (recipientEmail) {
            await (0, lifecycle_queue_1.enqueueLifecycleEmail)(shared_1.LifecycleEmailType.CUSTOMER_ORDER_PLACED, recipientEmail, recipientName, {
                orderId: order._id.toString(),
                totalAmount: Number(order.totalAmount ?? 0),
                eventId: order.eventId?.toString?.() ?? String(order.eventId),
            });
        }
        if (recipientPhone) {
            await lifecycleSmsQueue.add(shared_1.LifecycleSmsType.CUSTOMER_ORDER_PLACED, {
                phoneNumber: recipientPhone,
                message: `Your Hoizr booking is confirmed. Order #${order._id
                    .toString()
                    .slice(-6)
                    .toUpperCase()}. Check email/app for your QR.`,
            });
        }
    }
    async createOrder(customerId, input) {
        const event = await event_schema_1.EventModel.findOne({
            _id: input.eventId,
            isDeleted: false,
            isVisible: true,
            status: shared_1.EventStatus.PUBLISHED,
            adminPaused: { $ne: true },
        }).lean();
        if (!event)
            throw new mercurius_1.ErrorWithProps("Event not available for booking");
        const stored = await this.cart.readStoredCart(customerId, input.eventId);
        if (!stored || (!stored.tickets.length && !stored.extras.length)) {
            throw new mercurius_1.ErrorWithProps("Cart is empty or expired");
        }
        const reservedAt = this.assertCartReservationActive(stored.reservedAt);
        this.assertEventBookable(event);
        const ticketMap = new Map((event.tickets ?? []).map((t) => [String(t._id), t]));
        const extraMap = new Map((event.extras ?? []).map((e) => [String(e._id), e]));
        const orderTickets = stored.tickets.map((line) => {
            const ref = ticketMap.get(line.ticketId);
            if (!ref)
                throw new mercurius_1.ErrorWithProps("Ticket no longer available");
            if (ref.markAsOnGroundOnly) {
                throw new mercurius_1.ErrorWithProps(`${ref.ticketName} is on-ground only`);
            }
            if (ref.markAsComingSoon) {
                throw new mercurius_1.ErrorWithProps(`${ref.ticketName} is not yet available`);
            }
            if (ref.ticketVisible === false) {
                throw new mercurius_1.ErrorWithProps(`${ref.ticketName} is not visible`);
            }
            if (ref.ticketExpiryDateTime &&
                new Date(ref.ticketExpiryDateTime) < new Date()) {
                throw new mercurius_1.ErrorWithProps(`${ref.ticketName} is no longer on sale`);
            }
            if (ref.maxTicketPerUser && line.quantity > ref.maxTicketPerUser) {
                throw new mercurius_1.ErrorWithProps(`${ref.ticketName} allows max ${ref.maxTicketPerUser} per user`);
            }
            const unitPrice = Number(ref.ticketPrice ?? 0);
            // AUDIT-003: surface stale cart prices. If the host edited the
            // ticket price between add-to-cart and checkout (and the ticket
            // has no sales yet, so the immutability lock didn't reject the
            // edit), the customer's cart total no longer matches what we
            // would charge them. Reject so they can review. unitPriceAtAdd
            // is captured by cart.setCart; absent on legacy Redis rows so we
            // gate on `!= null`.
            const priceAtAdd = line.unitPriceAtAdd;
            if (priceAtAdd != null &&
                Number.isFinite(Number(priceAtAdd)) &&
                Math.round(Number(priceAtAdd) * 100) !==
                    Math.round(unitPrice * 100)) {
                throw new mercurius_1.ErrorWithProps(`Prices have changed for "${ref.ticketName}" — please review your cart before continuing.`);
            }
            // Capacity is the authoritative inventory check. ticketSold is
            // updated atomically by the cart reservation; we re-check here in
            // case a parallel reservation flipped capacity in the window
            // between cart-set and order-create.
            const remainingCapacity = Number(ref.ticketCapacity ?? 0) - Number(ref.ticketSold ?? 0);
            if (line.quantity > remainingCapacity) {
                throw new mercurius_1.ErrorWithProps(`${ref.ticketName} is no longer available in this quantity`);
            }
            return {
                ticketTypeId: line.ticketId,
                ticketName: String(ref.ticketName ?? "Ticket"),
                quantity: line.quantity,
                unitPrice,
                totalPrice: +(unitPrice * line.quantity).toFixed(2),
            };
        });
        const orderExtras = stored.extras.map((line) => {
            const ref = extraMap.get(line.extraId);
            if (!ref)
                throw new mercurius_1.ErrorWithProps("Extra no longer available");
            const available = Number(ref.quantity ?? 0) - Number(ref.sold ?? 0);
            if (line.quantity > available) {
                throw new mercurius_1.ErrorWithProps(`${ref.name ?? "Add-on"} is no longer available`);
            }
            const unitPrice = Number(ref.price ?? 0);
            // AUDIT-003: stale extras pricing — same shape as the ticket
            // price-match guard above. If a host bumped an add-on price
            // mid-cart the customer must re-confirm.
            const extraPriceAtAdd = line.unitPriceAtAdd;
            if (extraPriceAtAdd != null &&
                Number.isFinite(Number(extraPriceAtAdd)) &&
                Math.round(Number(extraPriceAtAdd) * 100) !==
                    Math.round(unitPrice * 100)) {
                throw new mercurius_1.ErrorWithProps(`Prices have changed for "${ref.name ?? "Add-on"}" — please review your cart before continuing.`);
            }
            return {
                extraId: line.extraId,
                extraName: String(ref.name ?? "Add-on"),
                quantity: line.quantity,
                unitPrice,
                totalPrice: +(unitPrice * line.quantity).toFixed(2),
            };
        });
        // Venue-wide capacity guard. Per-ticket caps can sum higher than the
        // venue allows (e.g. 100 GA + 50 VIP at a 120-cap venue). Defends
        // against the rare case where maxCapacity was lowered between cart
        // reservation and order placement — cart.assertLatestInventoryStillFits
        // already enforces this at reservation time.
        const eventMaxCapacity = Number(event.maxCapacity ?? 0);
        if (eventMaxCapacity > 0) {
            const allTickets = (event.tickets ?? []);
            const totalSold = allTickets.reduce((sum, t) => sum + Number(t.ticketSold ?? 0), 0);
            const totalDesired = orderTickets.reduce((sum, t) => sum + t.quantity, 0);
            if (totalSold + totalDesired > eventMaxCapacity) {
                throw new mercurius_1.ErrorWithProps(`This event has reached its venue capacity of ${eventMaxCapacity}.`);
            }
        }
        const ticketRefs = new Map((event.tickets ?? []).map((t) => [
            String(t._id),
            { ticketGST: t.ticketGST, gstRate: t.gstRate },
        ]));
        const [applicationFeePercent, applicationFeeGstPercent, hoizrCommissionGstPercent, host,] = await Promise.all([
            (0, configs_cache_1.getCachedConfigNumber)(shared_1.ConfigTypeEnum.platformFeeOnEvent, 5),
            (0, configs_cache_1.getCachedConfigNumber)(shared_1.ConfigTypeEnum.gstOnPlatformFeeOnEvent, 18),
            (0, configs_cache_1.getCachedConfigNumber)(shared_1.ConfigTypeEnum.gstOnComission, 18),
            this.loadHostGstContextForEvent(event),
        ]);
        const pricing = this.cart.computePricingForLines(orderTickets.map((t) => ({
            ticketId: t.ticketTypeId,
            quantity: t.quantity,
            unitPrice: t.unitPrice,
        })), orderExtras.map((e) => ({
            quantity: e.quantity,
            unitPrice: e.unitPrice,
        })), ticketRefs, applicationFeePercent, applicationFeeGstPercent, host);
        const grossAmount = pricing.grossAmount;
        // Resolve Hoizr commission first so we can include it in the config
        // snapshot for both free and paid orders. AI-selected rate wins,
        // fallback to the basic pricing plan; hard fail otherwise — we
        // never silently apply a default rate.
        const selectedPlan = event.pricingSnapshot;
        const aiCommissionPct = typeof event.aiSelectedCommissionPct === "number"
            ? event.aiSelectedCommissionPct
            : undefined;
        let hoizrCommissionPercent;
        if (typeof aiCommissionPct === "number") {
            hoizrCommissionPercent = aiCommissionPct;
        }
        else if (selectedPlan) {
            hoizrCommissionPercent = Number(selectedPlan.commissionRate ?? 0);
        }
        else {
            throw new mercurius_1.ErrorWithProps("Event is not priced: host must select a pricing plan before tickets can be sold.");
        }
        // AUDIT-007: lock AI Boost fee + mode at order creation. Reading
        // these from the live Event at settlement would let a host change
        // their active offer mid-event and have it retro-apply to orders
        // that were paid against the old rate. Snapshot it here.
        const aiBoostFeeRupees = Number(event.aiSelectedExtraAmount ?? selectedPlan?.upfrontFee ?? 0);
        const aiBoostGstPercent = await (0, configs_cache_1.getCachedConfigNumber)(shared_1.ConfigTypeEnum.gstOnAiBoost, 18);
        const appliedConfigSnapshot = this.buildConfigSnapshot({
            platformFeePercent: applicationFeePercent,
            platformFeeGstPercent: applicationFeeGstPercent,
            hoizrCommissionPercent,
            hoizrCommissionGstPercent,
            ticketGstPercent: pricing.taxesPercent,
            host,
            aiBoost: aiBoostFeeRupees > 0
                ? {
                    feeRupees: aiBoostFeeRupees,
                    gstPercent: aiBoostGstPercent,
                    adjustmentMode: event.feeSettlementMode,
                    offerId: event.selectedAiBoostGenerationId,
                }
                : undefined,
        });
        if (pricing.totalAmount <= 0) {
            const order = await this.finalizeFreeOrder(customerId, event, input, orderTickets, orderExtras, pricing, reservedAt, appliedConfigSnapshot);
            return { order };
        }
        const hoizrCommission = +(grossAmount *
            (hoizrCommissionPercent / 100)).toFixed(2);
        const finalDeclaredOfferAmount = Number(event.aiSelectedExtraAmount ?? selectedPlan?.upfrontFee ?? 0);
        const finalDeclaredCommission = hoizrCommission;
        const pending = await this.reusablePendingOrder(customerId, event._id.toString(), reservedAt, pricing.totalAmount, orderTickets, orderExtras);
        if (pending) {
            const checkout = await this.ensureRazorpayOrder(pending, event._id.toString(), customerId, pricing.totalAmount);
            return { order: pending.toObject ? pending.toObject() : pending, checkout };
        }
        const created = await order_schema_1.OrderModel.create({
            customerId,
            guestInfo: input.guestInfo,
            eventId: event._id.toString(),
            businessId: event.hostId,
            tickets: orderTickets,
            extras: orderExtras,
            subtotal: grossAmount,
            platformFee: pricing.applicationFee,
            platformFeeGst: pricing.platformFeeGst,
            totalAmount: pricing.totalAmount,
            applicationFeePercent: pricing.applicationFeePercent,
            taxes: pricing.taxes,
            taxesPercent: pricing.taxesPercent,
            hoizrCommission,
            hoizrCommissionPercent,
            razorpayFee: 0,
            selectedOptionId: selectedPlan?.optionId,
            finalDeclaredCommission,
            finalDeclaredOfferAmount,
            appliedConfigSnapshot,
            orderStatus: shared_1.OrderStatus.PAYMENT_PENDING,
            reservedAt,
            utm: input.utm,
            pageQuery: input.pageQuery,
            promoterId: input.promoterId,
            referralCode: input.referralCode,
        });
        const checkout = await this.ensureRazorpayOrder(created, event._id.toString(), customerId, pricing.totalAmount);
        await this.supersedeSiblingPendingOrders(customerId, event._id.toString(), created._id.toString());
        return { order: created.toObject(), checkout };
    }
    async getMyOrders(customerId, page = 1, pageSize = 20) {
        const safePage = Math.max(1, Math.floor(page));
        const safeSize = Math.min(50, Math.max(1, Math.floor(pageSize)));
        return order_schema_1.OrderModel.find({ customerId, isDeleted: false })
            .sort({ createdAt: -1 })
            .skip((safePage - 1) * safeSize)
            .limit(safeSize)
            .lean();
    }
    async getMyOrderById(customerId, orderId) {
        return order_schema_1.OrderModel.findOne({
            _id: orderId,
            customerId,
            isDeleted: false,
        }).lean();
    }
    /**
     * Mint a fresh signed Cloudinary URL for the customer-platform-fee
     * invoice tied to this order. The PDF itself is produced server-side
     * by the paid-order-fanout worker — if that hasn't run yet (race with
     * webhook delivery) or the invoice job failed, this resolves to null
     * and the UI tells the customer to retry shortly or check their email.
     *
     * Authorisation: the order must belong to the calling customer.
     * Without this check a leaked orderId would expose another customer's
     * invoice PII + GSTIN.
     */
    async getMyOrderInvoice(customerId, orderId) {
        if (!(0, validations_1.isAlphanumeric)(orderId)) {
            throw new mercurius_1.ErrorWithProps("Invalid order id");
        }
        const order = await order_schema_1.OrderModel.findOne({
            _id: orderId,
            customerId,
            isDeleted: false,
        })
            .select("_id customerId")
            .lean();
        if (!order)
            throw new mercurius_1.ErrorWithProps("Order not found");
        const invoice = await invoice_schema_1.InvoiceModel.findOne({
            relatedOrderId: orderId,
            type: shared_3.InvoiceType.CUSTOMER_PLATFORM_FEE_INVOICE,
            isVoided: { $ne: true },
        })
            .select("invoiceNumber pdfStoragePublicId dateOfIssue")
            .lean();
        if (!invoice || !invoice.pdfStoragePublicId)
            return null;
        const { signedUrl, expiresAt } = (0, cloudinary_1.generateSignedPdfUrl)(invoice.pdfStoragePublicId);
        return {
            invoiceNumber: invoice.invoiceNumber,
            pdfUrl: signedUrl,
            expiresAt,
            dateOfIssue: invoice.dateOfIssue,
        };
    }
    async requestOrderRefund(customerId, orderId, reason) {
        if (!(0, validations_1.isAlphanumeric)(orderId)) {
            throw new mercurius_1.ErrorWithProps("Invalid order id");
        }
        const trimmedReason = (reason ?? "").trim();
        if (trimmedReason.length < 3) {
            throw new mercurius_1.ErrorWithProps("Please select a refund reason");
        }
        const order = await order_schema_1.OrderModel.findOne({
            _id: orderId,
            customerId,
            isDeleted: false,
        }).lean();
        if (!order) {
            throw new mercurius_1.ErrorWithProps("Order not found");
        }
        if (order.orderStatus !== shared_1.OrderStatus.PAYMENT_SUCCESS) {
            throw new mercurius_1.ErrorWithProps("Only confirmed, unused tickets can be submitted for refund review");
        }
        if (order.checkedIn) {
            throw new mercurius_1.ErrorWithProps("Checked-in tickets are not eligible for refund");
        }
        const event = await event_schema_1.EventModel.findOne({
            _id: order.eventId,
            isDeleted: false,
        })
            .select("endDate refundPolicy")
            .lean();
        if (!event) {
            throw new mercurius_1.ErrorWithProps("Event not found");
        }
        const refundWindowDays = await (0, configs_cache_1.getCachedConfigNumber)(shared_1.ConfigTypeEnum.refundWindowDaysAfterEvent, 2);
        if (event.endDate) {
            const refundDeadline = new Date(event.endDate);
            refundDeadline.setDate(refundDeadline.getDate() + refundWindowDays);
            if (Date.now() > refundDeadline.getTime()) {
                throw new mercurius_1.ErrorWithProps("Refund window is closed for this event");
            }
        }
        const requestedAt = new Date();
        const updated = await order_schema_1.OrderModel.findOneAndUpdate({
            _id: order._id,
            customerId,
            isDeleted: false,
            orderStatus: shared_1.OrderStatus.PAYMENT_SUCCESS,
            checkedIn: { $ne: true },
            $or: [
                { "paymentMeta.refundRequest.status": { $exists: false } },
                {
                    "paymentMeta.refundRequest.status": {
                        $in: ["REJECTED", "CANCELLED"],
                    },
                },
            ],
        }, {
            $set: {
                "paymentMeta.refundRequest": {
                    status: "REQUESTED",
                    reason: trimmedReason,
                    requestedAt,
                    requestedBy: customerId,
                    refundPolicy: event.refundPolicy ?? "",
                    refundWindowDays,
                },
            },
        }, { new: true }).lean();
        if (!updated) {
            throw new mercurius_1.ErrorWithProps("Refund request already submitted or order is no longer eligible");
        }
        return updated;
    }
    /**
     * Verify the Razorpay client-side payment handshake AND finalize the
     * order in the same request. The Razorpay webhook is the safety net —
     * if the customer's browser closes mid-callback or the network drops,
     * the webhook still finalises the order minutes later. Verification
     * here is the same set the webhook applies (signature + fetchPayment
     * + amount + authorised/captured status), so promoting it to a
     * finaliser does not weaken the trust model.
     *
     * Idempotency: a single MongoDB transaction guards the status flip,
     * QR-payload generation, and per-variant inventory $inc using
     * `qrCodeData` as the sentinel — if the webhook (or a second
     * fast-path call) lands second, it sees the QR is already set and
     * exits without double-decrementing inventory or re-posting the
     * ledger.
     */
    async confirmPayment(customerId, razorpayOrderId, razorpayPaymentId, razorpaySignature) {
        const existing = await order_schema_1.OrderModel.findOne({
            razorpayOrderId,
            customerId,
            isDeleted: false,
        }).lean();
        if (!existing)
            throw new mercurius_1.ErrorWithProps("Order not found");
        const razorpay = (0, razorpay_client_1.getRazorpayPayments)();
        const signatureOk = razorpay.verifyCheckoutSignature({
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature: razorpaySignature ?? "",
        });
        if (!signatureOk) {
            throw new mercurius_1.ErrorWithProps("Invalid payment signature");
        }
        let payment;
        try {
            payment = await razorpay.fetchPayment(razorpayPaymentId);
        }
        catch {
            throw new mercurius_1.ErrorWithProps("Unable to verify payment with Razorpay");
        }
        if (payment?.order_id !== razorpayOrderId) {
            throw new mercurius_1.ErrorWithProps("Payment does not match this order");
        }
        const expectedAmountPaise = Math.round(Number(existing.totalAmount ?? 0) * 100);
        if (Number(payment?.amount ?? 0) !== expectedAmountPaise) {
            throw new mercurius_1.ErrorWithProps("Payment amount does not match this order");
        }
        const paymentStatus = String(payment?.status ?? "").toLowerCase();
        if (!["authorized", "captured"].includes(paymentStatus)) {
            throw new mercurius_1.ErrorWithProps("Payment is not authorised by Razorpay");
        }
        const razorpayFee = (Number(payment?.fee ?? 0) +
            Number(payment?.tax ?? 0)) /
            100;
        let finalized = null;
        const session = await typegoose_1.mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const order = await order_schema_1.OrderModel.findById(existing._id).session(session);
                if (!order)
                    return;
                // Idempotency sentinel: qrCodeData is set only on successful
                // finalisation (here or by the webhook). If it's already there
                // the work has been done by the other path — return the
                // already-finalised order.
                if (order.qrCodeData) {
                    finalized = order.toObject();
                    return;
                }
                // Only PAYMENT_PENDING orders can transition to PAYMENT_SUCCESS
                // via the fast-path. PAYMENT_FAILED / CANCELLED / REFUNDED /
                // SUPERSEDED are all the webhook's domain — if the customer
                // somehow drives the success callback against one of those,
                // bail and let the webhook handle the late-capture/manual
                // refund accounting.
                if (order.orderStatus !== shared_1.OrderStatus.PAYMENT_PENDING) {
                    finalized = order.toObject();
                    return;
                }
                const event = await event_schema_1.EventModel.findById(order.eventId)
                    .select("tickets extras")
                    .session(session)
                    .lean();
                if (!event)
                    throw new mercurius_1.ErrorWithProps("Event no longer exists");
                // Re-check inventory before incrementing. The webhook does the
                // same assertion under the same transaction — keeps both paths
                // consistent against an oversold race.
                const ticketMap = new Map((event.tickets ?? []).map((t) => [String(t._id), t]));
                const extraMap = new Map((event.extras ?? []).map((e) => [String(e._id), e]));
                for (const line of order.tickets ?? []) {
                    const ticket = ticketMap.get(String(line.ticketTypeId));
                    if (!ticket) {
                        throw new mercurius_1.ErrorWithProps(`${line.ticketName ?? "Ticket"} is no longer available`);
                    }
                    const capacity = Number(ticket.ticketCapacity ?? 0);
                    const sold = Number(ticket.ticketSold ?? 0);
                    const quantity = Number(line.quantity ?? 0);
                    if (sold + quantity > capacity) {
                        throw new mercurius_1.ErrorWithProps(`${line.ticketName ?? "Ticket"} is no longer available in this quantity`);
                    }
                }
                for (const line of order.extras ?? []) {
                    const extra = extraMap.get(String(line.extraId));
                    if (!extra) {
                        throw new mercurius_1.ErrorWithProps(`${line.extraName ?? "Add-on"} is no longer available`);
                    }
                    const capacity = Number(extra.quantity ?? 0);
                    const sold = Number(extra.sold ?? 0);
                    const quantity = Number(line.quantity ?? 0);
                    if (sold + quantity > capacity) {
                        throw new mercurius_1.ErrorWithProps(`${line.extraName ?? "Add-on"} is no longer available in this quantity`);
                    }
                }
                const qrPayload = `hoizr:${order._id.toString()}:${razorpayPaymentId}`;
                // AUDIT-023: versioned signing — see utils/qr-hash.ts.
                const qrSigned = (0, qr_hash_1.signQrPayload)(qrPayload);
                order.orderStatus = shared_1.OrderStatus.PAYMENT_SUCCESS;
                order.razorpayPaymentId = razorpayPaymentId;
                order.razorpaySignature = razorpaySignature;
                order.razorpayFee = razorpayFee;
                order.qrCodeData = qrPayload;
                order.qrCodeHash = qrSigned.hash;
                order.qrHashVersion = qrSigned.version;
                await order.save({ session });
                const ticketOps = (order.tickets ?? []).map((line) => ({
                    updateOne: {
                        filter: { _id: order.eventId, "tickets._id": line.ticketTypeId },
                        update: { $inc: { "tickets.$.ticketSold": line.quantity } },
                    },
                }));
                const extraOps = (order.extras ?? []).map((line) => ({
                    updateOne: {
                        filter: { _id: order.eventId, "extras._id": line.extraId },
                        update: { $inc: { "extras.$.sold": line.quantity } },
                    },
                }));
                if (ticketOps.length || extraOps.length) {
                    await event_schema_1.EventModel.bulkWrite([...ticketOps, ...extraOps], { session });
                }
                const now = new Date();
                await event_schema_1.EventModel.updateOne({ _id: order.eventId, firstSaleAt: { $exists: false } }, { $set: { firstSaleAt: now } }, { session });
                await event_schema_1.EventModel.updateOne({ _id: order.eventId }, { $set: { lastSaleAt: now } }, { session });
                await this.supersedeSiblingPendingOrders(order.customerId, order.eventId.toString(), order._id.toString(), session);
                finalized = order.toObject();
            });
        }
        finally {
            await session.endSession();
        }
        if (!finalized) {
            // Transaction returned without finalising — most likely the order
            // disappeared between the initial read and the session lookup.
            return existing;
        }
        // Best-effort cart cleanup outside the transaction — same as the
        // webhook's releaseCartLocksBestEffort. Cart Redis state is not
        // critical-path for the customer's ticket render, so a Redis blip
        // here should not roll back the order finalisation.
        try {
            await this.cart.finalizeCartForOrder(finalized.customerId, finalized.eventId.toString());
        }
        catch {
            // Cart cleanup is advisory; the order is already finalised.
        }
        // Fanout the lifecycle work (ledger + ticket email + SMS + follows
        // log) via the post-purchase worker. Deterministic jobId keeps the
        // webhook + this fast-path from running the fanout twice.
        if (finalized.orderStatus === shared_1.OrderStatus.PAYMENT_SUCCESS) {
            await postPurchaseQueue.add("APPLY_FOLLOWS_AND_SALES_LOG", { orderId: finalized._id.toString() }, {
                jobId: `post_purchase:${finalized._id.toString()}`,
                attempts: 3,
                backoff: { type: "exponential", delay: 5000 },
            });
            await soldOutTriggerQueue.add("CHECK_AFTER_SALE", { eventId: finalized.eventId.toString() }, { attempts: 2 });
        }
        return finalized;
    }
}
exports.default = OrderService;
