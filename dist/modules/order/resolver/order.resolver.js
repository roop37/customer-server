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
exports.OrderResolver = OrderResolver = __decorate([
    (0, type_graphql_1.Resolver)()
], OrderResolver);
