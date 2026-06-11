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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderResolver = void 0;
const type_graphql_1 = require("type-graphql");
const customer_auth_1 = require("../../../middlewares/customer-auth");
const order_input_1 = require("../interfaces/order.input");
const order_objects_1 = require("../interfaces/order.objects");
const order_view_1 = require("../interfaces/order.view");
const order_service_1 = __importDefault(require("../service/order.service"));
let OrderResolver = class OrderResolver {
    constructor() {
        this.service = new order_service_1.default();
    }
    async createOrder(ctx, input) {
        const result = await this.service.createOrder(ctx.customerId, input);
        return {
            order: (0, order_view_1.toCustomerOrderView)(result.order),
            checkout: result.checkout,
        };
    }
    /**
     * Guest checkout — PUBLIC (no customer auth). The buyer submits selected
     * tickets + contact details from the "Continue to checkout" modal. We
     * resolve/create the customer by phone and run the normal order flow.
     * (Rate-limit at the gateway/middleware level; value is gated by Razorpay.)
     */
    /** Resolve a host's offline payment link → prefill for the checkout page. */
    async offlinePaymentLink(shortCode) {
        return this.service.resolveOfflinePaymentLink(shortCode);
    }
    async createGuestOrder(input) {
        const { result, accountFound, accountEmail } = await this.service.createGuestOrder(input);
        return {
            order: (0, order_view_1.toCustomerOrderView)(result.order),
            checkout: result.checkout,
            accountFound,
            accountEmail,
        };
    }
    /**
     * AUDIT-030: lets the checkout client resume a PaymentPending order
     * the customer abandoned mid-Razorpay-popup, without minting a fresh
     * Razorpay order each time (which would risk a double-capture).
     */
    async reusePendingOrder(ctx, orderId) {
        const result = await this.service.reusePendingOrder(ctx.customerId, orderId);
        return {
            order: (0, order_view_1.toCustomerOrderView)(result.order),
            checkout: result.checkout,
        };
    }
    async confirmOrderPayment(ctx, razorpayOrderId, razorpayPaymentId, razorpaySignature) {
        const order = await this.service.confirmPayment(ctx.customerId, razorpayOrderId, razorpayPaymentId, razorpaySignature);
        return (0, order_view_1.toCustomerOrderView)(order);
    }
    async requestOrderRefund(ctx, orderId, reason) {
        const order = await this.service.requestOrderRefund(ctx.customerId, orderId, reason);
        return (0, order_view_1.toCustomerOrderView)(order);
    }
    async getMyOrders(ctx, input) {
        const orders = await this.service.getMyOrders(ctx.customerId, input?.page ?? 1, input?.pageSize ?? 20);
        return orders.map(order_view_1.toCustomerOrderView);
    }
    async getMyOrderById(ctx, orderId) {
        const order = await this.service.getMyOrderById(ctx.customerId, orderId);
        return order ? (0, order_view_1.toCustomerOrderView)(order) : null;
    }
    async getMyOrderInvoice(ctx, orderId) {
        return this.service.getMyOrderInvoice(ctx.customerId, orderId);
    }
};
exports.OrderResolver = OrderResolver;
__decorate([
    (0, type_graphql_1.Mutation)(() => order_objects_1.CreateOrderResponse),
    (0, type_graphql_1.UseMiddleware)(customer_auth_1.isCustomerAuthenticated),
    __param(0, (0, type_graphql_1.Ctx)()),
    __param(1, (0, type_graphql_1.Arg)("input")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, order_input_1.CreateOrderInput]),
    __metadata("design:returntype", Promise)
], OrderResolver.prototype, "createOrder", null);
__decorate([
    (0, type_graphql_1.Query)(() => order_objects_1.OfflinePaymentLinkView),
    __param(0, (0, type_graphql_1.Arg)("shortCode")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], OrderResolver.prototype, "offlinePaymentLink", null);
__decorate([
    (0, type_graphql_1.Mutation)(() => order_objects_1.GuestCheckoutResponse),
    __param(0, (0, type_graphql_1.Arg)("input")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [order_input_1.GuestOrderInput]),
    __metadata("design:returntype", Promise)
], OrderResolver.prototype, "createGuestOrder", null);
__decorate([
    (0, type_graphql_1.Mutation)(() => order_objects_1.CreateOrderResponse),
    (0, type_graphql_1.UseMiddleware)(customer_auth_1.isCustomerAuthenticated),
    __param(0, (0, type_graphql_1.Ctx)()),
    __param(1, (0, type_graphql_1.Arg)("orderId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], OrderResolver.prototype, "reusePendingOrder", null);
__decorate([
    (0, type_graphql_1.Mutation)(() => order_view_1.CustomerOrderView),
    (0, type_graphql_1.UseMiddleware)(customer_auth_1.isCustomerAuthenticated),
    __param(0, (0, type_graphql_1.Ctx)()),
    __param(1, (0, type_graphql_1.Arg)("razorpayOrderId")),
    __param(2, (0, type_graphql_1.Arg)("razorpayPaymentId")),
    __param(3, (0, type_graphql_1.Arg)("razorpaySignature")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", Promise)
], OrderResolver.prototype, "confirmOrderPayment", null);
__decorate([
    (0, type_graphql_1.Mutation)(() => order_view_1.CustomerOrderView),
    (0, type_graphql_1.UseMiddleware)(customer_auth_1.isCustomerAuthenticated),
    __param(0, (0, type_graphql_1.Ctx)()),
    __param(1, (0, type_graphql_1.Arg)("orderId")),
    __param(2, (0, type_graphql_1.Arg)("reason")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], OrderResolver.prototype, "requestOrderRefund", null);
__decorate([
    (0, type_graphql_1.Query)(() => [order_view_1.CustomerOrderView]),
    (0, type_graphql_1.UseMiddleware)(customer_auth_1.isCustomerAuthenticated),
    __param(0, (0, type_graphql_1.Ctx)()),
    __param(1, (0, type_graphql_1.Arg)("input", { nullable: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, order_input_1.MyOrdersFilterInput]),
    __metadata("design:returntype", Promise)
], OrderResolver.prototype, "getMyOrders", null);
__decorate([
    (0, type_graphql_1.Query)(() => order_view_1.CustomerOrderView, { nullable: true }),
    (0, type_graphql_1.UseMiddleware)(customer_auth_1.isCustomerAuthenticated),
    __param(0, (0, type_graphql_1.Ctx)()),
    __param(1, (0, type_graphql_1.Arg)("orderId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], OrderResolver.prototype, "getMyOrderById", null);
__decorate([
    (0, type_graphql_1.Query)(() => order_objects_1.CustomerOrderInvoice, { nullable: true }),
    (0, type_graphql_1.UseMiddleware)(customer_auth_1.isCustomerAuthenticated),
    __param(0, (0, type_graphql_1.Ctx)()),
    __param(1, (0, type_graphql_1.Arg)("orderId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], OrderResolver.prototype, "getMyOrderInvoice", null);
exports.OrderResolver = OrderResolver = __decorate([
    (0, type_graphql_1.Resolver)()
], OrderResolver);
