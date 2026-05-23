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
exports.CustomerPendingSignupVerifyOtpInput = exports.CustomerPendingSignupRequestOtpInput = exports.CustomerAppleStartInput = exports.CustomerGoogleStartInput = exports.CustomerOtpVerifyInput = exports.CustomerOtpRequestInput = void 0;
const type_graphql_1 = require("type-graphql");
let CustomerOtpRequestInput = class CustomerOtpRequestInput {
};
exports.CustomerOtpRequestInput = CustomerOtpRequestInput;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CustomerOtpRequestInput.prototype, "phone", void 0);
exports.CustomerOtpRequestInput = CustomerOtpRequestInput = __decorate([
    (0, type_graphql_1.InputType)()
], CustomerOtpRequestInput);
let CustomerOtpVerifyInput = class CustomerOtpVerifyInput {
};
exports.CustomerOtpVerifyInput = CustomerOtpVerifyInput;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CustomerOtpVerifyInput.prototype, "phone", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CustomerOtpVerifyInput.prototype, "otpId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CustomerOtpVerifyInput.prototype, "otp", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], CustomerOtpVerifyInput.prototype, "firstName", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], CustomerOtpVerifyInput.prototype, "lastName", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], CustomerOtpVerifyInput.prototype, "email", void 0);
exports.CustomerOtpVerifyInput = CustomerOtpVerifyInput = __decorate([
    (0, type_graphql_1.InputType)()
], CustomerOtpVerifyInput);
let CustomerGoogleStartInput = class CustomerGoogleStartInput {
};
exports.CustomerGoogleStartInput = CustomerGoogleStartInput;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CustomerGoogleStartInput.prototype, "idToken", void 0);
exports.CustomerGoogleStartInput = CustomerGoogleStartInput = __decorate([
    (0, type_graphql_1.InputType)()
], CustomerGoogleStartInput);
let CustomerAppleStartInput = class CustomerAppleStartInput {
};
exports.CustomerAppleStartInput = CustomerAppleStartInput;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CustomerAppleStartInput.prototype, "idToken", void 0);
exports.CustomerAppleStartInput = CustomerAppleStartInput = __decorate([
    (0, type_graphql_1.InputType)()
], CustomerAppleStartInput);
let CustomerPendingSignupRequestOtpInput = class CustomerPendingSignupRequestOtpInput {
};
exports.CustomerPendingSignupRequestOtpInput = CustomerPendingSignupRequestOtpInput;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CustomerPendingSignupRequestOtpInput.prototype, "pendingToken", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CustomerPendingSignupRequestOtpInput.prototype, "phone", void 0);
exports.CustomerPendingSignupRequestOtpInput = CustomerPendingSignupRequestOtpInput = __decorate([
    (0, type_graphql_1.InputType)()
], CustomerPendingSignupRequestOtpInput);
let CustomerPendingSignupVerifyOtpInput = class CustomerPendingSignupVerifyOtpInput {
};
exports.CustomerPendingSignupVerifyOtpInput = CustomerPendingSignupVerifyOtpInput;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CustomerPendingSignupVerifyOtpInput.prototype, "pendingToken", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CustomerPendingSignupVerifyOtpInput.prototype, "otp", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CustomerPendingSignupVerifyOtpInput.prototype, "firstName", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CustomerPendingSignupVerifyOtpInput.prototype, "lastName", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], CustomerPendingSignupVerifyOtpInput.prototype, "email", void 0);
exports.CustomerPendingSignupVerifyOtpInput = CustomerPendingSignupVerifyOtpInput = __decorate([
    (0, type_graphql_1.InputType)()
], CustomerPendingSignupVerifyOtpInput);
