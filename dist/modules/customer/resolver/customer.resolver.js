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
exports.CustomerResolver = void 0;
const shared_1 = require("@hoizr-technology/shared");
const type_graphql_1 = require("type-graphql");
const customer_auth_1 = require("../../../middlewares/customer-auth");
const customer_input_1 = require("../interfaces/customer.input");
const customer_service_1 = __importDefault(require("../service/customer.service"));
let CustomerResolver = class CustomerResolver {
    constructor() {
        this.service = new customer_service_1.default();
    }
    async getMyProfile(ctx) {
        return this.service.getMyProfile(ctx.customerId);
    }
    async updateMyProfile(ctx, input) {
        return this.service.updateMyProfile(ctx.customerId, input);
    }
    /**
     * Hoizr mobile / web push clients call this after the user grants
     * notification permission and Firebase hands back a registration
     * token. Idempotent: registering the same token again is a no-op.
     */
    async registerFcmToken(ctx, fcmToken) {
        return this.service.registerFcmToken(ctx.customerId, fcmToken);
    }
    /**
     * Removes a token — called on app logout or when a device is
     * unenrolled. The worker also calls into this path when FCM rejects
     * a token so we self-heal the customer record.
     */
    async unregisterFcmToken(ctx, fcmToken) {
        return this.service.unregisterFcmToken(ctx.customerId, fcmToken);
    }
};
exports.CustomerResolver = CustomerResolver;
__decorate([
    (0, type_graphql_1.Query)(() => shared_1.Customer),
    (0, type_graphql_1.UseMiddleware)(customer_auth_1.isCustomerAuthenticated),
    __param(0, (0, type_graphql_1.Ctx)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CustomerResolver.prototype, "getMyProfile", null);
__decorate([
    (0, type_graphql_1.Mutation)(() => shared_1.Customer),
    (0, type_graphql_1.UseMiddleware)(customer_auth_1.isCustomerAuthenticated),
    __param(0, (0, type_graphql_1.Ctx)()),
    __param(1, (0, type_graphql_1.Arg)("input")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, customer_input_1.UpdateCustomerProfileInput]),
    __metadata("design:returntype", Promise)
], CustomerResolver.prototype, "updateMyProfile", null);
__decorate([
    (0, type_graphql_1.Mutation)(() => Boolean),
    (0, type_graphql_1.UseMiddleware)(customer_auth_1.isCustomerAuthenticated),
    __param(0, (0, type_graphql_1.Ctx)()),
    __param(1, (0, type_graphql_1.Arg)("fcmToken")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], CustomerResolver.prototype, "registerFcmToken", null);
__decorate([
    (0, type_graphql_1.Mutation)(() => Boolean),
    (0, type_graphql_1.UseMiddleware)(customer_auth_1.isCustomerAuthenticated),
    __param(0, (0, type_graphql_1.Ctx)()),
    __param(1, (0, type_graphql_1.Arg)("fcmToken")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], CustomerResolver.prototype, "unregisterFcmToken", null);
exports.CustomerResolver = CustomerResolver = __decorate([
    (0, type_graphql_1.Resolver)()
], CustomerResolver);
