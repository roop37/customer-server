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
exports.CartResponse = exports.CartPricing = exports.CartExtraLine = exports.CartTicketLine = void 0;
const type_graphql_1 = require("type-graphql");
let CartTicketLine = class CartTicketLine {
};
exports.CartTicketLine = CartTicketLine;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CartTicketLine.prototype, "ticketId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CartTicketLine.prototype, "ticketName", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => type_graphql_1.Int),
    __metadata("design:type", Number)
], CartTicketLine.prototype, "quantity", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Number),
    __metadata("design:type", Number)
], CartTicketLine.prototype, "unitPrice", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Number),
    __metadata("design:type", Number)
], CartTicketLine.prototype, "totalPrice", void 0);
exports.CartTicketLine = CartTicketLine = __decorate([
    (0, type_graphql_1.ObjectType)()
], CartTicketLine);
let CartExtraLine = class CartExtraLine {
};
exports.CartExtraLine = CartExtraLine;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CartExtraLine.prototype, "extraId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CartExtraLine.prototype, "extraName", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => type_graphql_1.Int),
    __metadata("design:type", Number)
], CartExtraLine.prototype, "quantity", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Number),
    __metadata("design:type", Number)
], CartExtraLine.prototype, "unitPrice", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Number),
    __metadata("design:type", Number)
], CartExtraLine.prototype, "totalPrice", void 0);
exports.CartExtraLine = CartExtraLine = __decorate([
    (0, type_graphql_1.ObjectType)()
], CartExtraLine);
let CartPricing = class CartPricing {
};
exports.CartPricing = CartPricing;
__decorate([
    (0, type_graphql_1.Field)(() => Number),
    __metadata("design:type", Number)
], CartPricing.prototype, "grossAmount", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Number),
    __metadata("design:type", Number)
], CartPricing.prototype, "applicationFee", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Number),
    __metadata("design:type", Number)
], CartPricing.prototype, "applicationFeePercent", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Number),
    __metadata("design:type", Number)
], CartPricing.prototype, "platformFeeGst", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Number),
    __metadata("design:type", Number)
], CartPricing.prototype, "taxes", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Number),
    __metadata("design:type", Number)
], CartPricing.prototype, "taxesPercent", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Number),
    __metadata("design:type", Number)
], CartPricing.prototype, "totalAmount", void 0);
exports.CartPricing = CartPricing = __decorate([
    (0, type_graphql_1.ObjectType)()
], CartPricing);
let CartResponse = class CartResponse {
};
exports.CartResponse = CartResponse;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CartResponse.prototype, "eventId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => [CartTicketLine]),
    __metadata("design:type", Array)
], CartResponse.prototype, "tickets", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => [CartExtraLine]),
    __metadata("design:type", Array)
], CartResponse.prototype, "extras", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => CartPricing),
    __metadata("design:type", CartPricing)
], CartResponse.prototype, "pricing", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Date),
    __metadata("design:type", Date)
], CartResponse.prototype, "reservedAt", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Date),
    __metadata("design:type", Date)
], CartResponse.prototype, "expiresAt", void 0);
exports.CartResponse = CartResponse = __decorate([
    (0, type_graphql_1.ObjectType)()
], CartResponse);
