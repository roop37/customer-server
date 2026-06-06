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
exports.CustomerOrderInvoice = exports.CreateOrderResponse = exports.RazorpayCheckoutPayload = void 0;
const type_graphql_1 = require("type-graphql");
const order_view_1 = require("./order.view");
let RazorpayCheckoutPayload = class RazorpayCheckoutPayload {
};
exports.RazorpayCheckoutPayload = RazorpayCheckoutPayload;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], RazorpayCheckoutPayload.prototype, "razorpayOrderId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], RazorpayCheckoutPayload.prototype, "razorpayKeyId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Number),
    __metadata("design:type", Number)
], RazorpayCheckoutPayload.prototype, "amount", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], RazorpayCheckoutPayload.prototype, "currency", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], RazorpayCheckoutPayload.prototype, "orderId", void 0);
exports.RazorpayCheckoutPayload = RazorpayCheckoutPayload = __decorate([
    (0, type_graphql_1.ObjectType)()
], RazorpayCheckoutPayload);
let CreateOrderResponse = class CreateOrderResponse {
};
exports.CreateOrderResponse = CreateOrderResponse;
__decorate([
    (0, type_graphql_1.Field)(() => order_view_1.CustomerOrderView),
    __metadata("design:type", order_view_1.CustomerOrderView)
], CreateOrderResponse.prototype, "order", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => RazorpayCheckoutPayload, { nullable: true }),
    __metadata("design:type", RazorpayCheckoutPayload)
], CreateOrderResponse.prototype, "checkout", void 0);
exports.CreateOrderResponse = CreateOrderResponse = __decorate([
    (0, type_graphql_1.ObjectType)()
], CreateOrderResponse);
/**
 * Customer-facing invoice download payload. The signed URL is minted
 * fresh on every request (Cloudinary `private_download_url`) and is
 * short-lived — long enough for the browser to fetch the PDF, short
 * enough that a leaked link goes stale within minutes.
 */
let CustomerOrderInvoice = class CustomerOrderInvoice {
};
exports.CustomerOrderInvoice = CustomerOrderInvoice;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CustomerOrderInvoice.prototype, "invoiceNumber", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CustomerOrderInvoice.prototype, "pdfUrl", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Date),
    __metadata("design:type", Date)
], CustomerOrderInvoice.prototype, "expiresAt", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Date, { nullable: true }),
    __metadata("design:type", Date)
], CustomerOrderInvoice.prototype, "dateOfIssue", void 0);
exports.CustomerOrderInvoice = CustomerOrderInvoice = __decorate([
    (0, type_graphql_1.ObjectType)()
], CustomerOrderInvoice);
