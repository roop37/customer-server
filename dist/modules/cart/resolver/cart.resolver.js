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
exports.CartResolver = void 0;
const type_graphql_1 = require("type-graphql");
const customer_auth_1 = require("../../../middlewares/customer-auth");
const cart_input_1 = require("../interfaces/cart.input");
const cart_objects_1 = require("../interfaces/cart.objects");
const cart_service_1 = __importDefault(require("../service/cart.service"));
let CartResolver = class CartResolver {
    constructor() {
        this.service = new cart_service_1.default();
    }
    async getCart(ctx, eventId) {
        return this.service.getCart(ctx.customerId, eventId);
    }
    async setCart(ctx, input) {
        return this.service.setCart(ctx.customerId, input);
    }
    async clearCart(ctx, eventId) {
        return this.service.clearCart(ctx.customerId, eventId);
    }
};
exports.CartResolver = CartResolver;
__decorate([
    (0, type_graphql_1.Query)(() => cart_objects_1.CartResponse, { nullable: true }),
    (0, type_graphql_1.UseMiddleware)(customer_auth_1.isCustomerAuthenticated),
    __param(0, (0, type_graphql_1.Ctx)()),
    __param(1, (0, type_graphql_1.Arg)("eventId", () => String)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], CartResolver.prototype, "getCart", null);
__decorate([
    (0, type_graphql_1.Mutation)(() => cart_objects_1.CartResponse),
    (0, type_graphql_1.UseMiddleware)(customer_auth_1.isCustomerAuthenticated),
    __param(0, (0, type_graphql_1.Ctx)()),
    __param(1, (0, type_graphql_1.Arg)("input")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, cart_input_1.SetCartInput]),
    __metadata("design:returntype", Promise)
], CartResolver.prototype, "setCart", null);
__decorate([
    (0, type_graphql_1.Mutation)(() => Boolean),
    (0, type_graphql_1.UseMiddleware)(customer_auth_1.isCustomerAuthenticated),
    __param(0, (0, type_graphql_1.Ctx)()),
    __param(1, (0, type_graphql_1.Arg)("eventId", () => String)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], CartResolver.prototype, "clearCart", null);
exports.CartResolver = CartResolver = __decorate([
    (0, type_graphql_1.Resolver)()
], CartResolver);
