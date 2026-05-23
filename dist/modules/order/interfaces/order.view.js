"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toCustomerOrderView = exports.CustomerOrderView = void 0;
const shared_1 = require("@hoizr-technology/shared");
const type_graphql_1 = require("type-graphql");
/**
 * Customer-facing projection of Order.
 *
 * Internal accounting fields (hoizrCommission, razorpayFee, finalDeclared*,
 * paymentMeta) are intentionally NOT included. The schema definition in
 * hoizr-shared still exposes them via @Field, so we expose a sanitised
 * view from customer-server.
 */
let CustomerOrderView = class CustomerOrderView {
};
exports.CustomerOrderView = CustomerOrderView;
__decorate([
    (0, type_graphql_1.Field)(() => type_graphql_1.ID),
    __metadata("design:type", String)
], CustomerOrderView.prototype, "_id", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CustomerOrderView.prototype, "eventId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => shared_1.GuestInfo, { nullable: true }),
    __metadata("design:type", shared_1.GuestInfo)
], CustomerOrderView.prototype, "guestInfo", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => [shared_1.OrderTicketItem]),
    __metadata("design:type", Array)
], CustomerOrderView.prototype, "tickets", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => [shared_1.OrderExtraItem], { nullable: true }),
    __metadata("design:type", Array)
], CustomerOrderView.prototype, "extras", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Number),
    __metadata("design:type", Number)
], CustomerOrderView.prototype, "subtotal", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Number),
    __metadata("design:type", Number)
], CustomerOrderView.prototype, "platformFee", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Number),
    __metadata("design:type", Number)
], CustomerOrderView.prototype, "applicationFeePercent", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Number),
    __metadata("design:type", Number)
], CustomerOrderView.prototype, "platformFeeGst", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Number),
    __metadata("design:type", Number)
], CustomerOrderView.prototype, "taxes", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Number),
    __metadata("design:type", Number)
], CustomerOrderView.prototype, "taxesPercent", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Number),
    __metadata("design:type", Number)
], CustomerOrderView.prototype, "totalAmount", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => shared_1.OrderStatus),
    __metadata("design:type", String)
], CustomerOrderView.prototype, "orderStatus", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], CustomerOrderView.prototype, "razorpayOrderId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], CustomerOrderView.prototype, "razorpayPaymentId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], CustomerOrderView.prototype, "qrCodeData", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Boolean),
    __metadata("design:type", Boolean)
], CustomerOrderView.prototype, "checkedIn", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Date, { nullable: true }),
    __metadata("design:type", Date)
], CustomerOrderView.prototype, "checkedInAt", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Date),
    __metadata("design:type", Date)
], CustomerOrderView.prototype, "reservedAt", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Date, { nullable: true }),
    __metadata("design:type", Date)
], CustomerOrderView.prototype, "createdAt", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Date, { nullable: true }),
    __metadata("design:type", Date)
], CustomerOrderView.prototype, "updatedAt", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], CustomerOrderView.prototype, "refundRequestStatus", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Date, { nullable: true }),
    __metadata("design:type", Date)
], CustomerOrderView.prototype, "refundRequestedAt", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], CustomerOrderView.prototype, "refundRequestReason", void 0);
exports.CustomerOrderView = CustomerOrderView = __decorate([
    (0, type_graphql_1.ObjectType)()
], CustomerOrderView);
const toCustomerOrderView = (order) => {
    const refundRequest = order.paymentMeta?.refundRequest;
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
exports.toCustomerOrderView = toCustomerOrderView;
