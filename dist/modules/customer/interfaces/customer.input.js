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
exports.UpdateCustomerProfileInput = void 0;
const shared_1 = require("@hoizr-technology/shared");
const type_graphql_1 = require("type-graphql");
let UpdateCustomerProfileInput = class UpdateCustomerProfileInput {
};
exports.UpdateCustomerProfileInput = UpdateCustomerProfileInput;
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], UpdateCustomerProfileInput.prototype, "firstName", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], UpdateCustomerProfileInput.prototype, "lastName", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], UpdateCustomerProfileInput.prototype, "email", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Date, { nullable: true }),
    __metadata("design:type", Date)
], UpdateCustomerProfileInput.prototype, "birthdate", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => shared_1.Gender, { nullable: true }),
    __metadata("design:type", String)
], UpdateCustomerProfileInput.prototype, "gender", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], UpdateCustomerProfileInput.prototype, "city", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => shared_1.AddressInfoInput, { nullable: true }),
    __metadata("design:type", shared_1.AddressInfoInput)
], UpdateCustomerProfileInput.prototype, "address", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => [shared_1.Genre], { nullable: true }),
    __metadata("design:type", Array)
], UpdateCustomerProfileInput.prototype, "genrePreferences", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Boolean, { nullable: true }),
    __metadata("design:type", Boolean)
], UpdateCustomerProfileInput.prototype, "emailMarketingOptIn", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Boolean, { nullable: true }),
    __metadata("design:type", Boolean)
], UpdateCustomerProfileInput.prototype, "smsMarketingOptIn", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Boolean, { nullable: true }),
    __metadata("design:type", Boolean)
], UpdateCustomerProfileInput.prototype, "whatsappMarketingOptIn", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Boolean, { nullable: true }),
    __metadata("design:type", Boolean)
], UpdateCustomerProfileInput.prototype, "pushNotificationMarketingOptIn", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], UpdateCustomerProfileInput.prototype, "profilePic", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], UpdateCustomerProfileInput.prototype, "instagramHandle", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], UpdateCustomerProfileInput.prototype, "facebookHandle", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], UpdateCustomerProfileInput.prototype, "xHandle", void 0);
exports.UpdateCustomerProfileInput = UpdateCustomerProfileInput = __decorate([
    (0, type_graphql_1.InputType)()
], UpdateCustomerProfileInput);
