import {
  ArtistMerch,
  ArtistMerchOrder,
  ArtistMerchOrderStatus,
} from "@hoizr-technology/shared";
import { getModelForClass, mongoose } from "@typegoose/typegoose";
import crypto from "crypto";
import { ErrorWithProps } from "mercurius";
import Context from "../../../types/context.type";
import { EnvVars } from "../../../utils/environment";
import { getRazorpay } from "../../../utils/razorpay.client";
import { isAlphanumeric } from "../../../utils/validations";
import { ArtistMerchCheckoutPayload } from "../interfaces/artist-merch-order.objects";
import {
  ConfirmArtistMerchPaymentInput,
  CreateArtistMerchOrderInput,
} from "../interfaces/artist-merch-order.input";
import { ArtistMerchOrderModel } from "../schema/artist-merch-order.schema";

const ArtistMerchModel = getModelForClass(ArtistMerch, {
  schemaOptions: { timestamps: true },
});

class ArtistMerchOrderService {
  private requireCustomerId(ctx: Context): string {
    if (!ctx.customerId) {
      throw new ErrorWithProps("Not authenticated", { statusCode: 401 });
    }
    return ctx.customerId;
  }

  private async decrementTrackedStock(
    order: any,
    session: mongoose.ClientSession
  ): Promise<string | null> {
    const merch = await ArtistMerchModel.findById(order.merchId)
      .select("stock")
      .session(session)
      .lean<{ stock?: number | null }>();

    if (!merch) {
      return "Merch item no longer exists";
    }
    if (merch.stock === undefined || merch.stock === null) {
      return null;
    }

    const result = await ArtistMerchModel.updateOne(
      {
        _id: order.merchId,
        stock: { $gte: order.quantity },
      },
      { $inc: { stock: -order.quantity } },
      { session }
    );

    return result.modifiedCount === 1 ? null : "Not enough stock available";
  }

  async createOrder(
    input: CreateArtistMerchOrderInput,
    ctx: Context
  ): Promise<{ order: ArtistMerchOrder; checkout: ArtistMerchCheckoutPayload }> {
    const customerId = this.requireCustomerId(ctx);
    if (!isAlphanumeric(input.merchId)) {
      throw new ErrorWithProps("Invalid merch id");
    }
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new ErrorWithProps("Quantity must be a positive integer");
    }

    const merch = await ArtistMerchModel.findOne({
      _id: input.merchId,
      isDeleted: false,
      isActive: true,
    }).lean<ArtistMerch>();
    if (!merch) throw new ErrorWithProps("Merch item not available");

    if (merch.externalCheckoutUrl) {
      throw new ErrorWithProps(
        "This item is sold via an external store. Use the link on the artist page."
      );
    }

    if (
      merch.stock !== undefined &&
      merch.stock !== null &&
      merch.stock < input.quantity
    ) {
      throw new ErrorWithProps("Not enough stock available");
    }

    const totalAmount = +(merch.price * input.quantity).toFixed(2);
    if (totalAmount <= 0) {
      throw new ErrorWithProps("Order total must be greater than zero");
    }

    const order = await ArtistMerchOrderModel.create({
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
      status: ArtistMerchOrderStatus.PAYMENT_PENDING,
    });

    const razorpay = getRazorpay();
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
      order: order.toObject() as ArtistMerchOrder,
      checkout: {
        razorpayOrderId: rzpOrder.id,
        razorpayKeyId: EnvVars.values.RAZORPAY_KEY_ID,
        amount: totalAmount,
        currency: merch.currency,
        orderId: order._id.toString(),
      },
    };
  }

  async confirmPayment(
    input: ConfirmArtistMerchPaymentInput,
    ctx: Context
  ): Promise<ArtistMerchOrder> {
    const customerId = this.requireCustomerId(ctx);

    const order = await ArtistMerchOrderModel.findOne({
      razorpayOrderId: input.razorpayOrderId,
      customerId,
      isDeleted: false,
    });
    if (!order) throw new ErrorWithProps("Merch order not found");

    const expectedSignature = crypto
      .createHmac("sha256", EnvVars.values.RAZORPAY_KEY_SECRET)
      .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
      .digest("hex");
    if (expectedSignature !== input.razorpaySignature) {
      throw new ErrorWithProps("Invalid payment signature");
    }

    let finalOrder: any = null;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const claimed = await ArtistMerchOrderModel.findOneAndUpdate(
          {
            razorpayOrderId: input.razorpayOrderId,
            customerId,
            isDeleted: false,
            status: ArtistMerchOrderStatus.PAYMENT_PENDING,
          },
          {
            $set: {
              razorpayPaymentId: input.razorpayPaymentId,
              razorpaySignature: input.razorpaySignature,
              status: ArtistMerchOrderStatus.PAYMENT_SUCCESS,
            },
          },
          { new: false, session }
        );

        if (!claimed) {
          finalOrder = await ArtistMerchOrderModel.findOne({
            razorpayOrderId: input.razorpayOrderId,
            customerId,
            isDeleted: false,
          })
            .session(session)
            .lean<ArtistMerchOrder>();
          return;
        }

        const inventoryError = await this.decrementTrackedStock(
          claimed,
          session
        );
        if (inventoryError) {
          await ArtistMerchOrderModel.updateOne(
            { _id: claimed._id },
            {
              $set: {
                status: ArtistMerchOrderStatus.PAYMENT_FAILED,
                razorpayPaymentId: input.razorpayPaymentId,
                razorpaySignature: input.razorpaySignature,
                paymentMeta: {
                  errorCode: "INVENTORY_UNAVAILABLE_AFTER_PAYMENT",
                  errorDescription: inventoryError,
                  requiresManualRefund: true,
                },
              },
            },
            { session }
          );
          finalOrder = {
            ...claimed.toObject(),
            status: ArtistMerchOrderStatus.PAYMENT_FAILED,
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

        finalOrder = await ArtistMerchOrderModel.findById(claimed._id)
          .session(session)
          .lean<ArtistMerchOrder>();
      });
    } finally {
      await session.endSession();
    }

    if (!finalOrder) {
      throw new ErrorWithProps("Merch order not found");
    }
    if (
      finalOrder.status === ArtistMerchOrderStatus.PAYMENT_FAILED &&
      finalOrder.paymentMeta?.requiresManualRefund
    ) {
      throw new ErrorWithProps(
        "Payment was captured, but this merch item is no longer available. Hoizr support must refund this payment.",
        { statusCode: 409 }
      );
    }

    return finalOrder as ArtistMerchOrder;
  }

  async listMyMerchOrders(ctx: Context): Promise<ArtistMerchOrder[]> {
    const customerId = this.requireCustomerId(ctx);
    return ArtistMerchOrderModel.find({ customerId, isDeleted: false })
      .sort({ createdAt: -1 })
      .lean<ArtistMerchOrder[]>();
  }
}

export default ArtistMerchOrderService;
