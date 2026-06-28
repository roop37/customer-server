"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const shared_1 = require("@hoizr-technology/shared");
const configs_cache_1 = require("../../../utils/configs-cache");
const logger_1 = require("../../../log/logger");
const typegoose_1 = require("@typegoose/typegoose");
const coupon_eval_1 = require("./coupon-eval");
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
const nanoid_1 = require("nanoid");
const jwt_1 = require("../../../utils/jwt");
// Same `coupons` collection main-server writes — customer-server reads it to
// validate/redeem at checkout (Coupon class is shared).
const CouponModel = (0, typegoose_1.getModelForClass)(shared_1.Coupon, {
    schemaOptions: { timestamps: true, collection: "coupons" },
});
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
// Analytics ingest queue. tracking-server enqueues browser-side events
// (pageView, cartCreated, checkoutTriggered, …) here after enriching them
// with IP/UA/device. We enqueue the server-confirmed `orderPlaced` event —
// the only reliable conversion signal — directly, bypassing tracking-server's
// enrich (no request IP/UA available here), so we populate the funnel +
// attribution fields explicitly from the persisted Order. The hoizr-workers
// analyticsEventsWorker drains this queue into the AnalyticsEvent collection.
// Best-effort: tracking is never allowed to block or fail an order.
const analyticsEventsQueue = new bullmq_1.Queue(shared_1.QueueNames.analyticsEventsQueue, {
    connection: redis_1.redisClient,
    defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { age: 60, count: 1000 },
        removeOnFail: { age: 86400, count: 1000 },
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
    /**
     * Resolve + validate a coupon for an order being created. Throws a clear
     * message if a code was supplied but can't be applied (so the customer never
     * silently pays full price after expecting a discount). Returns null when no
     * code was given.
     */
    async resolveCouponForOrder(event, couponCode, orderTickets, customerId) {
        if (!couponCode?.trim())
            return null;
        const code = couponCode.trim().toUpperCase();
        const coupon = await CouponModel.findOne({
            host: String(event.hostId),
            code,
        }).lean();
        if (!coupon)
            throw new mercurius_1.ErrorWithProps("That promo code isn't valid for this event");
        // Event-scoped coupon (coupon.eventId set) is valid only for that event;
        // a global host promo (no eventId) works for any of the host's events.
        if (coupon.eventId && String(coupon.eventId) !== String(event._id))
            throw new mercurius_1.ErrorWithProps("That promo code isn't valid for this event");
        const ticketLines = orderTickets.map((t) => ({
            ticketId: t.ticketTypeId,
            grossPaise: Math.round(Number(t.unitPrice) * 100) *
                Math.max(0, Math.trunc(t.quantity)),
        }));
        const usage = Array.isArray(coupon.usage) ? coupon.usage : [];
        const customerUsageCount = customerId
            ? usage.filter((u) => String(u.customer) === String(customerId)).length
            : 0;
        let isFirstSignedOrder;
        if (coupon.couponUsageType === "FirstSignedOrder" && customerId) {
            const prior = await order_schema_1.OrderModel.countDocuments({
                customerId,
                orderStatus: {
                    $in: [shared_1.OrderStatus.PAYMENT_SUCCESS, shared_1.OrderStatus.CHECKED_IN],
                },
            });
            isFirstSignedOrder = prior === 0;
        }
        const res = (0, coupon_eval_1.evaluateCoupon)(coupon, {
            ticketLines,
            totalUsageCount: usage.length,
            customerUsageCount,
            isFirstSignedOrder,
        });
        if (!res.ok)
            throw new mercurius_1.ErrorWithProps(res.reason ?? "This coupon can't be applied");
        return { couponDiscountPaise: res.discountPaise, coupon };
    }
    /** Frozen order snapshot for a redeemed coupon (PROMO discount). */
    buildCouponSnapshot(coupon, discountAmount) {
        return {
            discountType: shared_1.OrderDiscountType.PROMO,
            discountAmount,
            promoData: {
                couponId: String(coupon._id),
                code: coupon.code,
                discountType: coupon.promoCodeDiscountType,
                discountValue: coupon.discountValue,
                uptoAmount: coupon.uptoAmount,
                discountAmount,
            },
        };
    }
    /**
     * Idempotently record a coupon redemption once an order is CONFIRMED, and
     * auto-deactivate the coupon when its overall usage count or sales limit is
     * reached. Never throws — coupon bookkeeping must not break a paid order.
     */
    async recordCouponRedemption(order) {
        const promo = order?.appliedDiscount?.promoData;
        if (!promo?.couponId)
            return;
        const orderId = String(order._id);
        const saleAmount = Number(order.subtotal ?? 0);
        try {
            await CouponModel.updateOne({ _id: promo.couponId, "usage.orderId": { $ne: orderId } }, {
                $push: {
                    usage: {
                        customer: order.customerId
                            ? String(order.customerId)
                            : undefined,
                        orderId,
                        email: order.guestInfo?.email,
                        phone: order.guestInfo?.phone,
                        name: [order.guestInfo?.firstName, order.guestInfo?.lastName]
                            .filter(Boolean)
                            .join(" ") || undefined,
                        discountApplied: Number(order.discountAmount ?? 0),
                        saleAmount,
                        usedAt: new Date(),
                    },
                },
                $inc: { totalSalesUsed: saleAmount },
            });
            await CouponModel.updateOne({ _id: promo.couponId, isActive: true }, [
                {
                    $set: {
                        isActive: {
                            $cond: [
                                {
                                    $or: [
                                        {
                                            $and: [
                                                { $ne: ["$maxUsage", null] },
                                                {
                                                    $gte: [
                                                        { $size: { $ifNull: ["$usage", []] } },
                                                        "$maxUsage",
                                                    ],
                                                },
                                            ],
                                        },
                                        {
                                            $and: [
                                                { $ne: ["$couponUsageSalesLimit", null] },
                                                {
                                                    $gte: ["$totalSalesUsed", "$couponUsageSalesLimit"],
                                                },
                                            ],
                                        },
                                    ],
                                },
                                false,
                                true,
                            ],
                        },
                    },
                },
            ]);
        }
        catch {
            /* coupon bookkeeping is best-effort; the order is already confirmed */
        }
    }
    /**
     * Read-only promo-code validation for the checkout UI. Returns a soft
     * result (never throws on an invalid code) with the discount + grand
     * total before/after so the client can show the savings line. Reuses the
     * exact same evaluator + pricing engine the order path uses, so a preview
     * that says ₹X off is what the buyer is actually charged.
     */
    async previewCoupon(input, customerId) {
        const code = (input.couponCode ?? "").trim().toUpperCase();
        const empty = {
            ok: false,
            code,
            reason: "Enter a promo code",
            discountAmount: 0,
            ticketsSubtotal: 0,
            totalBefore: 0,
            totalAfter: 0,
        };
        if (!code)
            return empty;
        const event = await event_schema_1.EventModel.findOne({
            _id: input.eventId,
            isDeleted: false,
            isVisible: true,
            status: shared_1.EventStatus.PUBLISHED,
            adminPaused: { $ne: true },
        }).lean();
        if (!event)
            return { ...empty, reason: "Event not available" };
        const ticketMap = new Map((event.tickets ?? []).map((t) => [String(t._id), t]));
        const orderTickets = (input.tickets ?? [])
            .map((line) => {
            const ref = ticketMap.get(line.ticketId);
            if (!ref)
                return null;
            const qty = Math.max(0, Math.trunc(Number(line.quantity) || 0));
            if (qty <= 0)
                return null;
            return {
                ticketTypeId: line.ticketId,
                quantity: qty,
                unitPrice: Number(ref.ticketPrice ?? 0),
            };
        })
            .filter(Boolean);
        if (orderTickets.length === 0)
            return { ...empty, reason: "Select tickets to apply a promo code" };
        const ticketRefs = new Map((event.tickets ?? []).map((t) => [
            String(t._id),
            { ticketGST: t.ticketGST, gstRate: t.gstRate },
        ]));
        const [applicationFeePercent, applicationFeeGstPercent, host] = await Promise.all([
            (0, configs_cache_1.getCachedConfigNumber)(shared_1.ConfigTypeEnum.platformFeeOnEvent, 5),
            (0, configs_cache_1.getCachedConfigNumber)(shared_1.ConfigTypeEnum.gstOnPlatformFeeOnEvent, 18),
            this.loadHostGstContextForEvent(event),
        ]);
        const pricingLines = orderTickets.map((t) => ({
            ticketId: t.ticketTypeId,
            quantity: t.quantity,
            unitPrice: t.unitPrice,
        }));
        const baseline = this.cart.computePricingForLines(pricingLines, [], ticketRefs, applicationFeePercent, applicationFeeGstPercent, host, 0);
        const baseFields = {
            ticketsSubtotal: baseline.grossAmount,
            totalBefore: baseline.totalAmount,
            totalAfter: baseline.totalAmount,
        };
        const coupon = await CouponModel.findOne({
            host: String(event.hostId),
            code,
        }).lean();
        if (!coupon ||
            (coupon.eventId && String(coupon.eventId) !== String(event._id)))
            return {
                ...empty,
                ...baseFields,
                reason: "That promo code isn't valid for this event",
            };
        const usage = Array.isArray(coupon.usage) ? coupon.usage : [];
        const customerUsageCount = customerId
            ? usage.filter((u) => String(u.customer) === String(customerId)).length
            : 0;
        let isFirstSignedOrder;
        if (coupon.couponUsageType === "FirstSignedOrder" && customerId) {
            const prior = await order_schema_1.OrderModel.countDocuments({
                customerId,
                orderStatus: {
                    $in: [shared_1.OrderStatus.PAYMENT_SUCCESS, shared_1.OrderStatus.CHECKED_IN],
                },
            });
            isFirstSignedOrder = prior === 0;
        }
        const ticketLines = orderTickets.map((t) => ({
            ticketId: t.ticketTypeId,
            grossPaise: Math.round(t.unitPrice * 100) * t.quantity,
        }));
        const res = (0, coupon_eval_1.evaluateCoupon)(coupon, {
            ticketLines,
            totalUsageCount: usage.length,
            customerUsageCount,
            isFirstSignedOrder,
        });
        if (!res.ok)
            return {
                ...empty,
                ...baseFields,
                reason: res.reason ?? "This coupon can't be applied",
            };
        const discounted = this.cart.computePricingForLines(pricingLines, [], ticketRefs, applicationFeePercent, applicationFeeGstPercent, host, res.discountPaise);
        return {
            ok: true,
            code,
            discountAmount: discounted.discountAmount,
            ticketsSubtotal: baseline.grossAmount,
            totalBefore: baseline.totalAmount,
            totalAfter: discounted.totalAmount,
            pricing: discounted,
        };
    }
    /**
     * Public, copyable promo codes for an event page. Returns only coupons the
     * host marked `showToCustomers`, that are active + in their date window, and
     * scoped either to THIS event or host-global (no eventId). `isActive` already
     * reflects the auto-deactivation when usage/sales limits are hit.
     */
    async visibleCouponsForEvent(eventId) {
        const event = await event_schema_1.EventModel.findOne({
            _id: eventId,
            isDeleted: false,
            isVisible: true,
            status: shared_1.EventStatus.PUBLISHED,
        }).lean();
        if (!event?.hostId)
            return [];
        const now = new Date();
        const coupons = await CouponModel.find({
            host: String(event.hostId),
            showToCustomers: true,
            isActive: true,
            startDate: { $lte: now },
            endDate: { $gte: now },
            $or: [
                { eventId: { $in: [null, ""] } },
                { eventId: { $exists: false } },
                { eventId: String(eventId) },
            ],
        })
            .sort({ createdAt: -1 })
            .lean();
        const label = (c) => {
            const upto = c.uptoAmount != null ? ` (up to ₹${Number(c.uptoAmount)})` : "";
            switch (c.promoCodeDiscountType) {
                case shared_1.PromoDiscountType.Percentage:
                    return `${Number(c.discountValue ?? 0)}% OFF${upto}`;
                case shared_1.PromoDiscountType.FixedAmount:
                    return `₹${Number(c.discountValue ?? 0)} OFF`;
                case shared_1.PromoDiscountType.Free:
                    return "FREE";
                default:
                    return "OFFER";
            }
        };
        return coupons.map((c) => ({
            code: c.code,
            description: c.description ?? undefined,
            discountLabel: label(c),
            minCartValue: c.minCartValue ?? undefined,
            endDate: c.endDate,
        }));
    }
    async finalizeFreeOrder(customerId, event, input, orderTickets, orderExtras, pricing, reservedAt, appliedConfigSnapshot, appliedDiscount) {
        const session = await typegoose_1.mongoose.startSession();
        let createdOrder = null;
        try {
            await session.withTransaction(async () => {
                const latestEvent = await event_schema_1.EventModel.findById(event._id)
                    .select("_id")
                    .session(session)
                    .lean();
                if (!latestEvent) {
                    throw new mercurius_1.ErrorWithProps("Event not available for booking");
                }
                const order = new order_schema_1.OrderModel({
                    customerId,
                    guestInfo: input.guestInfo,
                    eventId: event._id.toString(),
                    businessId: event.hostId,
                    tickets: orderTickets,
                    extras: orderExtras,
                    subtotal: pricing.grossAmount,
                    discountAmount: pricing.discountAmount,
                    appliedDiscount,
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
                for (const line of orderTickets) {
                    const ticketId = String(line.ticketTypeId);
                    const r = await event_schema_1.EventModel.updateOne({
                        _id: event._id,
                        "tickets._id": ticketId,
                        $expr: {
                            $let: {
                                vars: { t: { $arrayElemAt: [{ $filter: { input: "$tickets", as: "t", cond: { $eq: ["$$t._id", ticketId] } } }, 0] } },
                                in: { $lte: [{ $add: ["$$t.ticketSold", Number(line.quantity)] }, "$$t.ticketCapacity"] },
                            },
                        },
                    }, { $inc: { "tickets.$.ticketSold": Number(line.quantity) } }, { session });
                    if (r.matchedCount === 0) {
                        throw new mercurius_1.ErrorWithProps(`${line.ticketName ?? "Ticket"} is no longer available`);
                    }
                }
                for (const line of orderExtras) {
                    const extraId = String(line.extraId);
                    const r = await event_schema_1.EventModel.updateOne({
                        _id: event._id,
                        "extras._id": extraId,
                        $expr: {
                            $let: {
                                vars: { e: { $arrayElemAt: [{ $filter: { input: "$extras", as: "e", cond: { $eq: ["$$e._id", extraId] } } }, 0] } },
                                in: { $lte: [{ $add: ["$$e.sold", Number(line.quantity)] }, "$$e.quantity"] },
                            },
                        },
                    }, { $inc: { "extras.$.sold": Number(line.quantity) } }, { session });
                    if (r.matchedCount === 0) {
                        throw new mercurius_1.ErrorWithProps(`${line.extraName ?? "Add-on"} is no longer available`);
                    }
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
            // Free orders confirm immediately → record the coupon redemption now.
            await this.recordCouponRedemption(createdOrder);
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
        // Add-ons can't be bought on their own — require at least one ticket.
        if (!input.tickets?.length && (input.extras?.length ?? 0) > 0) {
            throw new mercurius_1.ErrorWithProps("Add-ons can only be purchased together with a ticket. Add at least one ticket to continue.");
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
        // NOTE: a guest purchase does exactly four things — take the contact
        // details, create the account if the phone is new, place the order, and
        // (for a freshly created account) log the buyer in. We deliberately do
        // NOT silently flip marketing opt-ins here: subscribing someone to
        // WhatsApp/email from a ticket purchase they didn't consent to is a
        // surprise side effect. Marketing preferences are set explicitly from the
        // profile/preferences surfaces, not as a hidden effect of checkout.
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
            couponCode: input.couponCode,
        });
        // Offline payment link → link the created order to its OfflineOrder
        // exactly (no fuzzy matching). The OfflineOrder flips to PAID when the
        // order finalises (post-purchase worker reads Order.offlineOrderId).
        if (input.offlineOrderId && result.order?._id) {
            await order_schema_1.OrderModel.updateOne({ _id: result.order._id }, {
                $set: { offlineOrderId: input.offlineOrderId, source: "OFFLINE_LINK" },
            });
        }
        // Always issue a session after guest checkout — the buyer just proved their
        // identity by completing payment. Existing accounts skip OTP here; that's
        // intentional (the order is already linked to their account and they've
        // demonstrated payment-method ownership). Uses the same token utils as the
        // OTP-verify path; the auth flow is untouched.
        const uniqueId = (0, nanoid_1.nanoid)();
        const { accessToken, refreshToken } = (0, jwt_1.createCustomerAuthTokens)({
            customer: resolved.customerId,
            version: 0,
            uniqueId,
        });
        await (0, jwt_1.storeCustomerRefreshToken)(resolved.customerId, uniqueId, refreshToken);
        const session = { accessToken, refreshToken, uniqueId };
        return {
            result,
            accountFound: resolved.existed,
            accountEmail: resolved.existed ? resolved.accountEmail : undefined,
            loggedIn: Boolean(session),
            session,
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
                    // Authoritative per-day tag from the event ticket (null single-day).
                    dayId: ref.dayId ?? undefined,
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
                    .select("_id")
                    .session(session)
                    .lean();
                if (!latestEvent)
                    throw new mercurius_1.ErrorWithProps("Event not available");
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
                for (const line of orderTickets) {
                    const ticketId = String(line.ticketTypeId);
                    const r = await event_schema_1.EventModel.updateOne({
                        _id: event._id,
                        "tickets._id": ticketId,
                        $expr: {
                            $let: {
                                vars: { t: { $arrayElemAt: [{ $filter: { input: "$tickets", as: "t", cond: { $eq: ["$$t._id", ticketId] } } }, 0] } },
                                in: { $lte: [{ $add: ["$$t.ticketSold", Number(line.quantity)] }, "$$t.ticketCapacity"] },
                            },
                        },
                    }, { $inc: { "tickets.$.ticketSold": Number(line.quantity) } }, { session });
                    if (r.matchedCount === 0) {
                        throw new mercurius_1.ErrorWithProps(`${line.ticketName ?? "Ticket"} is sold out`);
                    }
                }
                for (const line of orderExtras) {
                    const extraId = String(line.extraId);
                    const r = await event_schema_1.EventModel.updateOne({
                        _id: event._id,
                        "extras._id": extraId,
                        $expr: {
                            $let: {
                                vars: { e: { $arrayElemAt: [{ $filter: { input: "$extras", as: "e", cond: { $eq: ["$$e._id", extraId] } } }, 0] } },
                                in: { $lte: [{ $add: ["$$e.sold", Number(line.quantity)] }, "$$e.quantity"] },
                            },
                        },
                    }, { $inc: { "extras.$.sold": Number(line.quantity) } }, { session });
                    if (r.matchedCount === 0) {
                        throw new mercurius_1.ErrorWithProps(`${line.extraName ?? "Add-on"} is sold out`);
                    }
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
        // Server-side conversion event. Every confirmed-order path (free,
        // paid-webhook, guest, offline) converges here, so this is the single
        // reliable point to fire `orderPlaced` into the analytics funnel.
        // Best-effort only — a tracking failure must never throw out of order
        // confirmation, so the whole block is swallowed.
        try {
            await this.enqueueOrderPlacedAnalytics(order);
        }
        catch (err) {
            logger_1.logger.warn({
                message: "analytics:orderPlaced enqueue failed (non-blocking)",
                orderId: order?._id?.toString?.(),
                stack: err?.stack,
            });
        }
    }
    /**
     * Enqueue the canonical `orderPlaced` AnalyticsEvent. This BYPASSES the
     * tracking-server enrich step (we have no request IP / User-Agent here),
     * so the funnel + attribution fields are populated explicitly from the
     * persisted Order: the stored `utm` block, the host (`businessId`), and
     * — when the client captured them at checkout — the browsing `sessionId`
     * / visitor id, so this conversion stitches onto the same session as the
     * earlier pageView/cart events. The hoizr-workers analyticsEventsWorker
     * writes the payload straight to the AnalyticsEvent collection.
     */
    async enqueueOrderPlacedAnalytics(order) {
        const utm = order.utm ?? {};
        const ticketCount = (order.tickets ?? []).reduce((sum, t) => sum + Number(t?.quantity ?? 0), 0);
        const isGuest = Boolean(order.guestInfo) && !order.customerId;
        const payload = {
            eventType: shared_1.AnalyticsEventType.OrderPlaced,
            orderId: order._id?.toString?.() ?? String(order._id),
            eventId: order.eventId?.toString?.() ?? String(order.eventId),
            hostId: order.businessId?.toString?.() ?? order.businessId,
            customerId: order.customerId?.toString?.() ?? order.customerId,
            utmSource: utm.utmSource,
            utmMedium: utm.utmMedium,
            utmCampaign: utm.utmCampaign,
            utmContent: utm.utmContent,
            utmTerm: utm.utmTerm,
            app: "customer-server",
            clientTimestamp: new Date().toISOString(),
            metadata: {
                totalAmount: Number(order.totalAmount ?? 0),
                ticketCount,
                isGuest,
            },
        };
        // Carry through attribution signals only when the order actually stored
        // them — keeps the payload clean and avoids writing empty fields.
        if (order.trafficSource)
            payload.trafficSource = order.trafficSource;
        if (order.sessionId)
            payload.sessionId = order.sessionId;
        if (order.clientVisitorId)
            payload.clientVisitorId = order.clientVisitorId;
        // Use the same job name tracking-server uses so the worker's routing /
        // dashboards treat customer-server-emitted events identically.
        await analyticsEventsQueue.add("analytics-event", payload);
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
        // Add-ons are not standalone products — they can only be bought
        // alongside a ticket. Block an extras-only checkout.
        if (stored.tickets.length === 0 && stored.extras.length > 0) {
            throw new mercurius_1.ErrorWithProps("Add-ons can only be purchased together with a ticket. Add at least one ticket to continue.");
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
                throw new mercurius_1.ErrorWithProps(`"${ref.ticketName}" is in high demand right now and the quantity you picked was just snapped up. Please wait a moment and try again.`);
            }
            return {
                ticketTypeId: line.ticketId,
                ticketName: String(ref.ticketName ?? "Ticket"),
                // Snapshot the per-day tag so the scanner reads it off the order line
                // without re-joining the event (null on single-day events).
                dayId: ref.dayId ?? undefined,
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
        // Resolve + validate any applied coupon BEFORE pricing so the discount
        // reduces the ticket taxable (GST/fees/commission then recompute on the
        // discounted base — see HOIZR_FINANCE_SOURCE_OF_TRUTH.md).
        const couponResolved = await this.resolveCouponForOrder(event, input.couponCode, orderTickets, customerId);
        const pricing = this.cart.computePricingForLines(orderTickets.map((t) => ({
            ticketId: t.ticketTypeId,
            quantity: t.quantity,
            unitPrice: t.unitPrice,
        })), orderExtras.map((e) => ({
            quantity: e.quantity,
            unitPrice: e.unitPrice,
        })), ticketRefs, applicationFeePercent, applicationFeeGstPercent, host, couponResolved?.couponDiscountPaise ?? 0);
        const grossAmount = pricing.grossAmount;
        const appliedDiscount = couponResolved && pricing.discountAmount > 0
            ? this.buildCouponSnapshot(couponResolved.coupon, pricing.discountAmount)
            : undefined;
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
            const order = await this.finalizeFreeOrder(customerId, event, input, orderTickets, orderExtras, pricing, reservedAt, appliedConfigSnapshot, appliedDiscount);
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
            discountAmount: pricing.discountAmount,
            appliedDiscount,
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
                // Atomic check-and-increment per ticket — prevents concurrent oversell.
                // matchedCount===0 means the ticket doesn't exist or capacity is exceeded.
                for (const line of order.tickets ?? []) {
                    const ticketId = String(line.ticketTypeId);
                    const r = await event_schema_1.EventModel.updateOne({
                        _id: order.eventId,
                        "tickets._id": ticketId,
                        $expr: {
                            $let: {
                                vars: { t: { $arrayElemAt: [{ $filter: { input: "$tickets", as: "t", cond: { $eq: ["$$t._id", ticketId] } } }, 0] } },
                                in: { $lte: [{ $add: ["$$t.ticketSold", Number(line.quantity)] }, "$$t.ticketCapacity"] },
                            },
                        },
                    }, { $inc: { "tickets.$.ticketSold": Number(line.quantity) } }, { session });
                    if (r.matchedCount === 0) {
                        throw new mercurius_1.ErrorWithProps(`${line.ticketName ?? "Ticket"} is no longer available`);
                    }
                }
                for (const line of order.extras ?? []) {
                    const extraId = String(line.extraId);
                    const r = await event_schema_1.EventModel.updateOne({
                        _id: order.eventId,
                        "extras._id": extraId,
                        $expr: {
                            $let: {
                                vars: { e: { $arrayElemAt: [{ $filter: { input: "$extras", as: "e", cond: { $eq: ["$$e._id", extraId] } } }, 0] } },
                                in: { $lte: [{ $add: ["$$e.sold", Number(line.quantity)] }, "$$e.quantity"] },
                            },
                        },
                    }, { $inc: { "extras.$.sold": Number(line.quantity) } }, { session });
                    if (r.matchedCount === 0) {
                        throw new mercurius_1.ErrorWithProps(`${line.extraName ?? "Add-on"} is no longer available`);
                    }
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
            // Paid order confirmed → record the coupon redemption (idempotent).
            await this.recordCouponRedemption(finalized);
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
