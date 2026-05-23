"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const shared_1 = require("@hoizr-technology/shared");
const typegoose_1 = require("@typegoose/typegoose");
const crypto_1 = __importDefault(require("crypto"));
const email_queue_1 = require("../../../email/email.queue");
const sms_queue_1 = require("../../../sms/sms.queue");
const logger_1 = require("../../../log/logger");
const environment_1 = require("../../../utils/environment");
const cart_service_1 = __importDefault(require("../../cart/service/cart.service"));
const event_schema_1 = require("../../event/schema/event.schema");
const order_schema_1 = require("../../order/schema/order.schema");
const post_purchase_service_1 = __importDefault(require("./post-purchase.service"));
class RazorpayWebhookService {
    constructor() {
        this.cart = new cart_service_1.default();
        this.postPurchase = new post_purchase_service_1.default();
    }
    verifySignature(rawBody, signature) {
        const expected = crypto_1.default
            .createHmac("sha256", environment_1.EnvVars.values.RAZORPAY_WEBHOOK_SECRET)
            .update(typeof rawBody === "string" ? rawBody : rawBody.toString("utf8"))
            .digest("hex");
        return expected === signature;
    }
    /**
     * Process a Razorpay webhook event. The handler is idempotent: replays
     * for the same razorpay_payment_id are no-ops because the Order has
     * already transitioned out of PAYMENT_PENDING.
     */
    async handleEvent(payload) {
        const eventType = payload.event;
        if (eventType === "payment.captured" || eventType === "order.paid") {
            const paymentEntity = payload.payload?.payment?.entity;
            if (!paymentEntity)
                return;
            await this.finalizeSuccess(paymentEntity);
            return;
        }
        if (eventType === "payment.failed") {
            const paymentEntity = payload.payload?.payment?.entity;
            if (!paymentEntity)
                return;
            await this.finalizeFailure(paymentEntity);
            return;
        }
        if (eventType === "refund.processed" || eventType === "refund.created") {
            const refundEntity = payload.payload?.refund?.entity;
            if (!refundEntity)
                return;
            await this.recordRefund(refundEntity);
            return;
        }
        logger_1.logger.info(`Ignoring Razorpay webhook event: ${eventType}`);
    }
    async finalizeSuccess(paymentEntity) {
        const razorpayOrderId = paymentEntity.order_id;
        const razorpayPaymentId = paymentEntity.id;
        const razorpayFee = (Number(paymentEntity.fee ?? 0) + Number(paymentEntity.tax ?? 0)) / 100;
        let processedOrder = null;
        const session = await typegoose_1.mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const order = await order_schema_1.OrderModel.findOne({ razorpayOrderId }).session(session);
                if (!order) {
                    logger_1.logger.warn(`Order not found for razorpayOrderId ${razorpayOrderId}`);
                    return;
                }
                if (order.orderStatus !== shared_1.OrderStatus.PAYMENT_PENDING) {
                    // Already processed - idempotent no-op
                    return;
                }
                order.orderStatus = shared_1.OrderStatus.PAYMENT_SUCCESS;
                order.razorpayPaymentId = razorpayPaymentId;
                order.razorpayFee = razorpayFee;
                const qrPayload = `hoizr:${order._id.toString()}:${razorpayPaymentId}`;
                const qrHash = crypto_1.default
                    .createHmac("sha256", environment_1.EnvVars.values.ENCRYPTION_KEY)
                    .update(qrPayload)
                    .digest("hex");
                order.qrCodeData = qrPayload;
                order.qrCodeHash = qrHash;
                await order.save({ session });
                // Bump persistent counters for tickets and extras
                const ticketBulk = order.tickets?.map((line) => ({
                    updateOne: {
                        filter: { _id: order.eventId, "tickets._id": line.ticketTypeId },
                        update: { $inc: { "tickets.$.ticketSold": line.quantity } },
                    },
                })) ?? [];
                const extraBulk = order.extras?.map((line) => ({
                    updateOne: {
                        filter: { _id: order.eventId, "extras._id": line.extraId },
                        update: { $inc: { "extras.$.sold": line.quantity } },
                    },
                })) ?? [];
                const allOps = [...ticketBulk, ...extraBulk];
                if (allOps.length) {
                    await event_schema_1.EventModel.bulkWrite(allOps, { session });
                }
                const now = new Date();
                await event_schema_1.EventModel.updateOne({ _id: order.eventId, firstSaleAt: { $exists: false } }, { $set: { firstSaleAt: now } }, { session });
                await event_schema_1.EventModel.updateOne({ _id: order.eventId }, { $set: { lastSaleAt: now } }, { session });
                processedOrder = order;
            });
        }
        finally {
            await session.endSession();
        }
        if (!processedOrder)
            return;
        // Post-payment side effects run OUTSIDE the transaction so a failure
        // does not roll back the (already-paid) order. These are non-critical
        // and idempotent enough that occasional failures only cause analytics
        // gaps, not money loss.
        try {
            await this.postPurchase.applyOrderFollowsAndSalesLog(processedOrder, null);
        }
        catch (err) {
            logger_1.logger.error(`Post-purchase side effects failed for order ${processedOrder._id}: ${err?.message ?? err}`);
        }
        try {
            await this.cart.finalizeCartForOrder(processedOrder.customerId, processedOrder.eventId);
        }
        catch (err) {
            logger_1.logger.error(`Cart finalisation failed for order ${processedOrder._id}: ${err?.message ?? err}`);
        }
        try {
            await this.enqueueConfirmation(processedOrder);
        }
        catch (err) {
            logger_1.logger.error(`Confirmation enqueue failed for order ${processedOrder._id}: ${err?.message ?? err}`);
        }
    }
    async finalizeFailure(paymentEntity) {
        const razorpayOrderId = paymentEntity.order_id;
        const order = await order_schema_1.OrderModel.findOne({ razorpayOrderId });
        if (!order)
            return;
        if (order.orderStatus !== shared_1.OrderStatus.PAYMENT_PENDING)
            return;
        order.orderStatus = shared_1.OrderStatus.PAYMENT_FAILED;
        order.razorpayPaymentId = paymentEntity.id;
        order.paymentMeta = {
            errorCode: paymentEntity.error_code,
            errorDescription: paymentEntity.error_description,
            errorSource: paymentEntity.error_source,
        };
        await order.save();
        // Release the customer's reservation so the inventory is freed
        await this.cart.finalizeCartForOrder(order.customerId, order.eventId);
    }
    async recordRefund(refundEntity) {
        const razorpayPaymentId = refundEntity.payment_id;
        const order = await order_schema_1.OrderModel.findOne({ razorpayPaymentId });
        if (!order)
            return;
        order.razorpayRefundId = refundEntity.id;
        order.refundAmount = Number(refundEntity.amount ?? 0) / 100;
        order.refundedAt = new Date();
        if (order.orderStatus !== shared_1.OrderStatus.CHECKED_IN) {
            order.orderStatus = shared_1.OrderStatus.REFUNDED;
        }
        await order.save();
    }
    async enqueueConfirmation(order) {
        const phone = order.guestInfo?.phone;
        if (phone) {
            await sms_queue_1.smsQueue.add("ORDER_CONFIRMATION", {
                phoneNumber: phone,
                message: `Your Hoizr booking is confirmed. Order: ${order._id.toString()}`,
            });
        }
        const email = order.guestInfo?.email;
        if (email) {
            await email_queue_1.customerEmailQueue.add("ORDER_CONFIRMATION", {
                emailSendingConfig: {
                    template: "order-confirmation",
                    subject: "Your Hoizr booking is confirmed",
                },
                to: email,
                data: { orderId: order._id.toString() },
            });
        }
    }
}
exports.default = RazorpayWebhookService;
