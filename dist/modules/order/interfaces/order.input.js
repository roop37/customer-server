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
exports.GuestOrderInput = exports.GuestCartExtraInput = exports.PreviewCouponInput = exports.GuestCartTicketInput = exports.CreateOrderInput = exports.GuestInfoInput = exports.UTMInput = exports.MyOrdersFilterInput = void 0;
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
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], CreateOrderInput.prototype, "couponCode", void 0);
exports.CreateOrderInput = CreateOrderInput = __decorate([
    (0, type_graphql_1.InputType)()
], CreateOrderInput);
let GuestCartTicketInput = class GuestCartTicketInput {
};
exports.GuestCartTicketInput = GuestCartTicketInput;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], GuestCartTicketInput.prototype, "ticketId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => type_graphql_1.Int),
    __metadata("design:type", Number)
], GuestCartTicketInput.prototype, "quantity", void 0);
exports.GuestCartTicketInput = GuestCartTicketInput = __decorate([
    (0, type_graphql_1.InputType)()
], GuestCartTicketInput);
/**
 * Validate a promo code against an event + the buyer's current ticket
 * selection and return a discount preview. Read-only: never mutates the
 * coupon or creates an order. Works for guest + logged-in buyers.
 */
let PreviewCouponInput = class PreviewCouponInput {
};
exports.PreviewCouponInput = PreviewCouponInput;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], PreviewCouponInput.prototype, "eventId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], PreviewCouponInput.prototype, "couponCode", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => [GuestCartTicketInput]),
    __metadata("design:type", Array)
], PreviewCouponInput.prototype, "tickets", void 0);
exports.PreviewCouponInput = PreviewCouponInput = __decorate([
    (0, type_graphql_1.InputType)()
], PreviewCouponInput);
let GuestCartExtraInput = class GuestCartExtraInput {
};
exports.GuestCartExtraInput = GuestCartExtraInput;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], GuestCartExtraInput.prototype, "extraId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => type_graphql_1.Int),
    __metadata("design:type", Number)
], GuestCartExtraInput.prototype, "quantity", void 0);
exports.GuestCartExtraInput = GuestCartExtraInput = __decorate([
    (0, type_graphql_1.InputType)()
], GuestCartExtraInput);
/**
 * Guest checkout: a not-logged-in buyer submits their selected tickets +
 * contact details together (the modal opened on "Continue to checkout").
 * The server resolves/creates a customer by phone, seeds the cart, and runs
 * the normal order flow.
 */
let GuestOrderInput = class GuestOrderInput {
};
exports.GuestOrderInput = GuestOrderInput;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], GuestOrderInput.prototype, "eventId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => [GuestCartTicketInput]),
    __metadata("design:type", Array)
], GuestOrderInput.prototype, "tickets", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => [GuestCartExtraInput], { nullable: true }),
    __metadata("design:type", Array)
], GuestOrderInput.prototype, "extras", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], GuestOrderInput.prototype, "firstName", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], GuestOrderInput.prototype, "lastName", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], GuestOrderInput.prototype, "email", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], GuestOrderInput.prototype, "phone", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Boolean, { nullable: true }),
    __metadata("design:type", Boolean)
], GuestOrderInput.prototype, "notifyMe", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], GuestOrderInput.prototype, "offlineOrderId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => UTMInput, { nullable: true }),
    __metadata("design:type", UTMInput)
], GuestOrderInput.prototype, "utm", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], GuestOrderInput.prototype, "pageQuery", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], GuestOrderInput.prototype, "referralCode", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], GuestOrderInput.prototype, "promoterId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], GuestOrderInput.prototype, "couponCode", void 0);
exports.GuestOrderInput = GuestOrderInput = __decorate([
    (0, type_graphql_1.InputType)()
], GuestOrderInput);
