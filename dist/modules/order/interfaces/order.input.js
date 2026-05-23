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
exports.CreateOrderInput = exports.GuestInfoInput = exports.UTMInput = exports.MyOrdersFilterInput = void 0;
const type_graphql_1 = require("type-graphql");
let MyOrdersFilterInput = class MyOrdersFilterInput {
};
exports.MyOrdersFilterInput = MyOrdersFilterInput;
__decorate([
    (0, type_graphql_1.Field)(() => type_graphql_1.Int, { nullable: true }),
    __metadata("design:type", Number)
], MyOrdersFilterInput.prototype, "page", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => type_graphql_1.Int, { nullable: true }),
    __metadata("design:type", Number)
], MyOrdersFilterInput.prototype, "pageSize", void 0);
exports.MyOrdersFilterInput = MyOrdersFilterInput = __decorate([
    (0, type_graphql_1.InputType)()
], MyOrdersFilterInput);
let UTMInput = class UTMInput {
};
exports.UTMInput = UTMInput;
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], UTMInput.prototype, "utmSource", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], UTMInput.prototype, "utmMedium", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], UTMInput.prototype, "utmCampaign", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], UTMInput.prototype, "utmTerm", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], UTMInput.prototype, "utmContent", void 0);
exports.UTMInput = UTMInput = __decorate([
    (0, type_graphql_1.InputType)()
], UTMInput);
let GuestInfoInput = class GuestInfoInput {
};
exports.GuestInfoInput = GuestInfoInput;
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], GuestInfoInput.prototype, "firstName", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], GuestInfoInput.prototype, "lastName", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], GuestInfoInput.prototype, "email", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], GuestInfoInput.prototype, "phone", void 0);
exports.GuestInfoInput = GuestInfoInput = __decorate([
    (0, type_graphql_1.InputType)()
], GuestInfoInput);
let CreateOrderInput = class CreateOrderInput {
};
exports.CreateOrderInput = CreateOrderInput;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CreateOrderInput.prototype, "eventId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => GuestInfoInput, { nullable: true }),
    __metadata("design:type", GuestInfoInput)
], CreateOrderInput.prototype, "guestInfo", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => UTMInput, { nullable: true }),
    __metadata("design:type", UTMInput)
], CreateOrderInput.prototype, "utm", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], CreateOrderInput.prototype, "pageQuery", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], CreateOrderInput.prototype, "referralCode", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], CreateOrderInput.prototype, "promoterId", void 0);
exports.CreateOrderInput = CreateOrderInput = __decorate([
    (0, type_graphql_1.InputType)()
], CreateOrderInput);
