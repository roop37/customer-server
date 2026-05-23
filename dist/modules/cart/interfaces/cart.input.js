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
exports.GetCartInput = exports.SetCartInput = exports.CartExtraLineInput = exports.CartTicketLineInput = void 0;
const type_graphql_1 = require("type-graphql");
let CartTicketLineInput = class CartTicketLineInput {
};
exports.CartTicketLineInput = CartTicketLineInput;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CartTicketLineInput.prototype, "ticketId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => type_graphql_1.Int),
    __metadata("design:type", Number)
], CartTicketLineInput.prototype, "quantity", void 0);
exports.CartTicketLineInput = CartTicketLineInput = __decorate([
    (0, type_graphql_1.InputType)()
], CartTicketLineInput);
let CartExtraLineInput = class CartExtraLineInput {
};
exports.CartExtraLineInput = CartExtraLineInput;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CartExtraLineInput.prototype, "extraId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => type_graphql_1.Int),
    __metadata("design:type", Number)
], CartExtraLineInput.prototype, "quantity", void 0);
exports.CartExtraLineInput = CartExtraLineInput = __decorate([
    (0, type_graphql_1.InputType)()
], CartExtraLineInput);
let SetCartInput = class SetCartInput {
};
exports.SetCartInput = SetCartInput;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], SetCartInput.prototype, "eventId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => [CartTicketLineInput]),
    __metadata("design:type", Array)
], SetCartInput.prototype, "tickets", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => [CartExtraLineInput], { nullable: true }),
    __metadata("design:type", Array)
], SetCartInput.prototype, "extras", void 0);
exports.SetCartInput = SetCartInput = __decorate([
    (0, type_graphql_1.InputType)()
], SetCartInput);
let GetCartInput = class GetCartInput {
};
exports.GetCartInput = GetCartInput;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], GetCartInput.prototype, "eventId", void 0);
exports.GetCartInput = GetCartInput = __decorate([
    (0, type_graphql_1.InputType)()
], GetCartInput);
