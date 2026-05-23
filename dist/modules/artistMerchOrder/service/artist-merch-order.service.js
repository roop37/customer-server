"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const shared_1 = require("@hoizr-technology/shared");
const typegoose_1 = require("@typegoose/typegoose");
const crypto_1 = __importDefault(require("crypto"));
const mercurius_1 = require("mercurius");
const environment_1 = require("../../../utils/environment");
const razorpay_client_1 = require("../../../utils/razorpay.client");
const validations_1 = require("../../../utils/validations");
const artist_merch_order_schema_1 = require("../schema/artist-merch-order.schema");
const ArtistMerchModel = (0, typegoose_1.getModelForClass)(shared_1.ArtistMerch, {
    schemaOptions: { timestamps: true },
});
class ArtistMerchOrderService {
    requireCustomerId(ctx) {
        if (!ctx.customerId) {
            throw new mercurius_1.ErrorWithProps("Not authenticated", { statusCode: 401 });
        }
        return ctx.customerId;
    }
    async decrementTrackedStock(order, session) {
        const merch = await ArtistMerchModel.findById(order.merchId)
            .select("stock")
            .session(session)
            .lean();
        if (!merch) {
            return "Merch item no longer exists";
        }
        if (merch.stock === undefined || merch.stock === null) {
            return null;
        }
        const result = await ArtistMerchModel.updateOne({
            _id: order.merchId,
            stock: { $gte: order.quantity },
        }, { $inc: { stock: -order.quantity } }, { session });
        return result.modifiedCount === 1 ? null : "Not enough stock available";
    }
    async createOrder(input, ctx) {
        const customerId = this.requireCustomerId(ctx);
        if (!(0, validations_1.isAlphanumeric)(input.merchId)) {
            throw new mercurius_1.ErrorWithProps("Invalid merch id");
        }
        if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
            throw new mercurius_1.ErrorWithProps("Quantity must be a positive integer");
        }
        const merch = await ArtistMerchModel.findOne({
            _id: input.merchId,
            isDeleted: false,
            isActive: true,
        }).lean();
        if (!merch)
            throw new mercurius_1.ErrorWithProps("Merch item not available");
        if (merch.externalCheckoutUrl) {
            throw new mercurius_1.ErrorWithProps("This item is sold via an external store. Use the link on the artist page.");
        }
        if (merch.stock !== undefined &&
            merch.stock !== null &&
            merch.stock < input.quantity) {
            throw new mercurius_1.ErrorWithProps("Not enough stock available");
        }
        const totalAmount = +(merch.price * input.quantity).toFixed(2);
        if (totalAmount <= 0) {
            throw new mercurius_1.ErrorWithProps("Order total must be greater than zero");
        }
        const order = await artist_merch_order_schema_1.ArtistMerchOrderModel.create({
            customerId,
            artistId: merch.artistId,
            merchId: merch._id.toString(),
            itemName: merch.name,
            quantity: input.quantity,
            unitPrice: merch.price,
            totalAmount,
            currency: merch.currency,
            shippingName: input.shippingName,
            shippingPhone: input.shippingPhone,
            shippingAddressLine1: input.shippingAddressLine1,
            shippingAddressLine2: input.shippingAddressLine2,
            shippingCity: input.shippingCity,
            shippingState: input.shippingState,
            shippingPincode: input.shippingPincode,
            status: shared_1.ArtistMerchOrderStatus.PAYMENT_PENDING,
        });
        const razorpay = (0, razorpay_client_1.getRazorpay)();
        const rzpOrder = await razorpay.orders.create({
            amount: Math.round(totalAmount * 100),
            currency: merch.currency,
            receipt: order._id.toString(),
            notes: {
                kind: "merch",
                merchOrderId: order._id.toString(),
                artistId: merch.artistId,
                merchId: merch._id.toString(),
                customerId,
            },
        });
        order.razorpayOrderId = rzpOrder.id;
        await order.save();
        return {
            order: order.toObject(),
            checkout: {
                razorpayOrderId: rzpOrder.id,
                razorpayKeyId: environment_1.EnvVars.values.RAZORPAY_KEY_ID,
                amount: totalAmount,
                currency: merch.currency,
                orderId: order._id.toString(),
            },
        };
    }
    async confirmPayment(input, ctx) {
        const customerId = this.requireCustomerId(ctx);
        const order = await artist_merch_order_schema_1.ArtistMerchOrderModel.findOne({
            razorpayOrderId: input.razorpayOrderId,
            customerId,
            isDeleted: false,
        });
        if (!order)
            throw new mercurius_1.ErrorWithProps("Merch order not found");
        const expectedSignature = crypto_1.default
            .createHmac("sha256", environment_1.EnvVars.values.RAZORPAY_KEY_SECRET)
            .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
            .digest("hex");
        if (expectedSignature !== input.razorpaySignature) {
            throw new mercurius_1.ErrorWithProps("Invalid payment signature");
        }
        let finalOrder = null;
        const session = await typegoose_1.mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const claimed = await artist_merch_order_schema_1.ArtistMerchOrderModel.findOneAndUpdate({
                    razorpayOrderId: input.razorpayOrderId,
                    customerId,
                    isDeleted: false,
                    status: shared_1.ArtistMerchOrderStatus.PAYMENT_PENDING,
                }, {
                    $set: {
                        razorpayPaymentId: input.razorpayPaymentId,
                        razorpaySignature: input.razorpaySignature,
                        status: shared_1.ArtistMerchOrderStatus.PAYMENT_SUCCESS,
                    },
                }, { new: false, session });
                if (!claimed) {
                    finalOrder = await artist_merch_order_schema_1.ArtistMerchOrderModel.findOne({
                        razorpayOrderId: input.razorpayOrderId,
                        customerId,
                        isDeleted: false,
                    })
                        .session(session)
                        .lean();
                    return;
                }
                const inventoryError = await this.decrementTrackedStock(claimed, session);
                if (inventoryError) {
                    await artist_merch_order_schema_1.ArtistMerchOrderModel.updateOne({ _id: claimed._id }, {
                        $set: {
                            status: shared_1.ArtistMerchOrderStatus.PAYMENT_FAILED,
                            razorpayPaymentId: input.razorpayPaymentId,
                            razorpaySignature: input.razorpaySignature,
                            paymentMeta: {
                                errorCode: "INVENTORY_UNAVAILABLE_AFTER_PAYMENT",
                                errorDescription: inventoryError,
                                requiresManualRefund: true,
                            },
                        },
                    }, { session });
                    finalOrder = {
                        ...claimed.toObject(),
                        status: shared_1.ArtistMerchOrderStatus.PAYMENT_FAILED,
                        razorpayPaymentId: input.razorpayPaymentId,
                        razorpaySignature: input.razorpaySignature,
                        paymentMeta: {
                            errorCode: "INVENTORY_UNAVAILABLE_AFTER_PAYMENT",
                            errorDescription: inventoryError,
                            requiresManualRefund: true,
                        },
                    };
                    return;
                }
                finalOrder = await artist_merch_order_schema_1.ArtistMerchOrderModel.findById(claimed._id)
                    .session(session)
                    .lean();
            });
        }
        finally {
            await session.endSession();
        }
        if (!finalOrder) {
            throw new mercurius_1.ErrorWithProps("Merch order not found");
        }
        if (finalOrder.status === shared_1.ArtistMerchOrderStatus.PAYMENT_FAILED &&
            finalOrder.paymentMeta?.requiresManualRefund) {
            throw new mercurius_1.ErrorWithProps("Payment was captured, but this merch item is no longer available. Hoizr support must refund this payment.", { statusCode: 409 });
        }
        return finalOrder;
    }
    async listMyMerchOrders(ctx) {
        const customerId = this.requireCustomerId(ctx);
        return artist_merch_order_schema_1.ArtistMerchOrderModel.find({ customerId, isDeleted: false })
            .sort({ createdAt: -1 })
            .lean();
    }
}
exports.default = ArtistMerchOrderService;
