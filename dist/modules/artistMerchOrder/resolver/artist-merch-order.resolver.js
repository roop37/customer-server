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
exports.ArtistMerchOrderResolver = void 0;
const shared_1 = require("@hoizr-technology/shared");
const type_graphql_1 = require("type-graphql");
const customer_auth_1 = require("../../../middlewares/customer-auth");
const artist_merch_order_input_1 = require("../interfaces/artist-merch-order.input");
const artist_merch_order_objects_1 = require("../interfaces/artist-merch-order.objects");
const artist_merch_order_service_1 = __importDefault(require("../service/artist-merch-order.service"));
let ArtistMerchOrderResolver = class ArtistMerchOrderResolver {
    constructor() {
        this.service = new artist_merch_order_service_1.default();
    }
    async createArtistMerchOrder(input, ctx) {
        return this.service.createOrder(input, ctx);
    }
    async confirmArtistMerchPayment(input, ctx) {
        return this.service.confirmPayment(input, ctx);
    }
    async myArtistMerchOrders(ctx) {
        return this.service.listMyMerchOrders(ctx);
    }
};
exports.ArtistMerchOrderResolver = ArtistMerchOrderResolver;
__decorate([
    (0, type_graphql_1.Mutation)(() => artist_merch_order_objects_1.CreateArtistMerchOrderResult),
    (0, type_graphql_1.UseMiddleware)(customer_auth_1.isCustomerAuthenticated),
    __param(0, (0, type_graphql_1.Arg)("input")),
    __param(1, (0, type_graphql_1.Ctx)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [artist_merch_order_input_1.CreateArtistMerchOrderInput, Object]),
    __metadata("design:returntype", Promise)
], ArtistMerchOrderResolver.prototype, "createArtistMerchOrder", null);
__decorate([
    (0, type_graphql_1.Mutation)(() => shared_1.ArtistMerchOrder),
    (0, type_graphql_1.UseMiddleware)(customer_auth_1.isCustomerAuthenticated),
    __param(0, (0, type_graphql_1.Arg)("input")),
    __param(1, (0, type_graphql_1.Ctx)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [artist_merch_order_input_1.ConfirmArtistMerchPaymentInput, Object]),
    __metadata("design:returntype", Promise)
], ArtistMerchOrderResolver.prototype, "confirmArtistMerchPayment", null);
__decorate([
    (0, type_graphql_1.Query)(() => [shared_1.ArtistMerchOrder]),
    (0, type_graphql_1.UseMiddleware)(customer_auth_1.isCustomerAuthenticated),
    __param(0, (0, type_graphql_1.Ctx)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ArtistMerchOrderResolver.prototype, "myArtistMerchOrders", null);
exports.ArtistMerchOrderResolver = ArtistMerchOrderResolver = __decorate([
    (0, type_graphql_1.Resolver)()
], ArtistMerchOrderResolver);
