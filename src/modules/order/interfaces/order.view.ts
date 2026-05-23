import {
  GuestInfo,
  Order,
  OrderExtraItem,
  OrderStatus,
  OrderTicketItem,
} from "@hoizr-technology/shared";
import { Field, ID, ObjectType } from "type-graphql";

/**
 * Customer-facing projection of Order.
 *
 * Internal accounting fields (hoizrCommission, razorpayFee, finalDeclared*,
 * paymentMeta) are intentionally NOT included. The schema definition in
 * hoizr-shared still exposes them via @Field, so we expose a sanitised
 * view from customer-server.
 */
@ObjectType()
export class CustomerOrderView {
  @Field(() => ID)
  _id: string;

  @Field(() => String)
  eventId: string;

  @Field(() => GuestInfo, { nullable: true })
  guestInfo?: GuestInfo;

  @Field(() => [OrderTicketItem])
  tickets: OrderTicketItem[];

  @Field(() => [OrderExtraItem], { nullable: true })
  extras?: OrderExtraItem[];

  @Field(() => Number)
  subtotal: number;

  @Field(() => Number)
  platformFee: number;

  @Field(() => Number)
  applicationFeePercent: number;

  @Field(() => Number)
  platformFeeGst: number;

  @Field(() => Number)
  taxes: number;

  @Field(() => Number)
  taxesPercent: number;

  @Field(() => Number)
  totalAmount: number;

  @Field(() => OrderStatus)
  orderStatus: OrderStatus;

  @Field(() => String, { nullable: true })
  razorpayOrderId?: string;

  @Field(() => String, { nullable: true })
  razorpayPaymentId?: string;

  @Field(() => String, { nullable: true })
  qrCodeData?: string;

  @Field(() => Boolean)
  checkedIn: boolean;

  @Field(() => Date, { nullable: true })
  checkedInAt?: Date;

  @Field(() => Date)
  reservedAt: Date;

  @Field(() => Date, { nullable: true })
  createdAt?: Date;

  @Field(() => Date, { nullable: true })
  updatedAt?: Date;

  @Field(() => String, { nullable: true })
  refundRequestStatus?: string;

  @Field(() => Date, { nullable: true })
  refundRequestedAt?: Date;

  @Field(() => String, { nullable: true })
  refundRequestReason?: string;
}

export const toCustomerOrderView = (order: Order): CustomerOrderView => {
  const refundRequest = (order.paymentMeta as any)?.refundRequest;
  return {
    _id: order._id?.toString(),
    eventId: order.eventId,
    guestInfo: order.guestInfo,
    tickets: order.tickets,
    extras: order.extras,
    subtotal: order.subtotal,
    platformFee: order.platformFee,
    applicationFeePercent: order.applicationFeePercent,
    platformFeeGst: order.platformFeeGst,
    taxes: order.taxes,
    taxesPercent: order.taxesPercent,
    totalAmount: order.totalAmount,
    orderStatus: order.orderStatus,
    razorpayOrderId: order.razorpayOrderId,
    razorpayPaymentId: order.razorpayPaymentId,
    qrCodeData: order.qrCodeData,
    checkedIn: order.checkedIn,
    checkedInAt: order.checkedInAt,
    reservedAt: order.reservedAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    refundRequestStatus: refundRequest?.status,
    refundRequestedAt: refundRequest?.requestedAt,
    refundRequestReason: refundRequest?.reason,
  };
};
