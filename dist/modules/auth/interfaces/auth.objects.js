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
exports.CustomerPendingSignupVerifyOtpResponse = exports.PendingSignupOutcome = exports.CustomerPendingSignupRequestOtpResponse = exports.CustomerGoogleStartResponse = exports.GoogleStartPrefill = exports.GoogleStartOutcome = exports.CustomerTokenRefreshResponse = exports.CustomerAuthResponse = exports.CustomerOtpResponse = void 0;
const type_graphql_1 = require("type-graphql");
let CustomerOtpResponse = class CustomerOtpResponse {
};
exports.CustomerOtpResponse = CustomerOtpResponse;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CustomerOtpResponse.prototype, "otpId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Boolean),
    __metadata("design:type", Boolean)
], CustomerOtpResponse.prototype, "profileRequired", void 0);
exports.CustomerOtpResponse = CustomerOtpResponse = __decorate([
    (0, type_graphql_1.ObjectType)()
], CustomerOtpResponse);
let CustomerAuthResponse = class CustomerAuthResponse {
};
exports.CustomerAuthResponse = CustomerAuthResponse;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CustomerAuthResponse.prototype, "customerId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CustomerAuthResponse.prototype, "accessToken", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CustomerAuthResponse.prototype, "refreshToken", void 0);
exports.CustomerAuthResponse = CustomerAuthResponse = __decorate([
    (0, type_graphql_1.ObjectType)()
], CustomerAuthResponse);
let CustomerTokenRefreshResponse = class CustomerTokenRefreshResponse {
};
exports.CustomerTokenRefreshResponse = CustomerTokenRefreshResponse;
__decorate([
    (0, type_graphql_1.Field)(() => Boolean),
    __metadata("design:type", Boolean)
], CustomerTokenRefreshResponse.prototype, "success", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], CustomerTokenRefreshResponse.prototype, "accessToken", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], CustomerTokenRefreshResponse.prototype, "refreshToken", void 0);
exports.CustomerTokenRefreshResponse = CustomerTokenRefreshResponse = __decorate([
    (0, type_graphql_1.ObjectType)()
], CustomerTokenRefreshResponse);
/**
 * Outcome of customerGoogleStart. Three possibilities:
 *   LOGGED_IN — already-linked Google account or matched-by-id login.
 *   LINKED_EXISTING_BY_EMAIL — Google email matched a phone-OTP customer
 *     who had no Google linked yet; we connected Google on the spot and
 *     issued tokens. Frontend shows a "we linked your Google sign-in"
 *     modal so the customer understands what happened.
 *   PENDING_PHONE_REQUIRED — no matching account exists; the customer
 *     must complete phone-OTP verification (using pendingToken) before
 *     the account is created.
 */
var GoogleStartOutcome;
(function (GoogleStartOutcome) {
    GoogleStartOutcome["LOGGED_IN"] = "LOGGED_IN";
    GoogleStartOutcome["LINKED_EXISTING_BY_EMAIL"] = "LINKED_EXISTING_BY_EMAIL";
    GoogleStartOutcome["PENDING_PHONE_REQUIRED"] = "PENDING_PHONE_REQUIRED";
})(GoogleStartOutcome || (exports.GoogleStartOutcome = GoogleStartOutcome = {}));
(0, type_graphql_1.registerEnumType)(GoogleStartOutcome, { name: "GoogleStartOutcome" });
let GoogleStartPrefill = class GoogleStartPrefill {
};
exports.GoogleStartPrefill = GoogleStartPrefill;
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], GoogleStartPrefill.prototype, "email", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], GoogleStartPrefill.prototype, "firstName", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], GoogleStartPrefill.prototype, "lastName", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], GoogleStartPrefill.prototype, "picture", void 0);
exports.GoogleStartPrefill = GoogleStartPrefill = __decorate([
    (0, type_graphql_1.ObjectType)()
], GoogleStartPrefill);
let CustomerGoogleStartResponse = class CustomerGoogleStartResponse {
};
exports.CustomerGoogleStartResponse = CustomerGoogleStartResponse;
__decorate([
    (0, type_graphql_1.Field)(() => GoogleStartOutcome),
    __metadata("design:type", String)
], CustomerGoogleStartResponse.prototype, "outcome", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], CustomerGoogleStartResponse.prototype, "customerId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], CustomerGoogleStartResponse.prototype, "accessToken", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], CustomerGoogleStartResponse.prototype, "refreshToken", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], CustomerGoogleStartResponse.prototype, "uniqueId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], CustomerGoogleStartResponse.prototype, "pendingToken", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => GoogleStartPrefill, { nullable: true }),
    __metadata("design:type", GoogleStartPrefill)
], CustomerGoogleStartResponse.prototype, "prefill", void 0);
exports.CustomerGoogleStartResponse = CustomerGoogleStartResponse = __decorate([
    (0, type_graphql_1.ObjectType)()
], CustomerGoogleStartResponse);
let CustomerPendingSignupRequestOtpResponse = class CustomerPendingSignupRequestOtpResponse {
};
exports.CustomerPendingSignupRequestOtpResponse = CustomerPendingSignupRequestOtpResponse;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CustomerPendingSignupRequestOtpResponse.prototype, "otpId", void 0);
exports.CustomerPendingSignupRequestOtpResponse = CustomerPendingSignupRequestOtpResponse = __decorate([
    (0, type_graphql_1.ObjectType)()
], CustomerPendingSignupRequestOtpResponse);
/**
 * Outcome of pending-signup OTP verification. Two success paths
 * (NEW_ACCOUNT, LINKED_AS_SECONDARY) both return tokens; the latter
 * carries info the frontend uses to render an explanatory modal.
 * Rejections throw ErrorWithProps with a `code` so the frontend can
 * route to the matching modal.
 */
var PendingSignupOutcome;
(function (PendingSignupOutcome) {
    PendingSignupOutcome["NEW_ACCOUNT"] = "NEW_ACCOUNT";
    PendingSignupOutcome["LINKED_AS_SECONDARY"] = "LINKED_AS_SECONDARY";
})(PendingSignupOutcome || (exports.PendingSignupOutcome = PendingSignupOutcome = {}));
(0, type_graphql_1.registerEnumType)(PendingSignupOutcome, { name: "PendingSignupOutcome" });
let CustomerPendingSignupVerifyOtpResponse = class CustomerPendingSignupVerifyOtpResponse {
};
exports.CustomerPendingSignupVerifyOtpResponse = CustomerPendingSignupVerifyOtpResponse;
__decorate([
    (0, type_graphql_1.Field)(() => PendingSignupOutcome),
    __metadata("design:type", String)
], CustomerPendingSignupVerifyOtpResponse.prototype, "outcome", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CustomerPendingSignupVerifyOtpResponse.prototype, "customerId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CustomerPendingSignupVerifyOtpResponse.prototype, "accessToken", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CustomerPendingSignupVerifyOtpResponse.prototype, "refreshToken", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CustomerPendingSignupVerifyOtpResponse.prototype, "uniqueId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], CustomerPendingSignupVerifyOtpResponse.prototype, "primaryEmailMasked", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], CustomerPendingSignupVerifyOtpResponse.prototype, "secondaryEmail", void 0);
exports.CustomerPendingSignupVerifyOtpResponse = CustomerPendingSignupVerifyOtpResponse = __decorate([
    (0, type_graphql_1.ObjectType)()
], CustomerPendingSignupVerifyOtpResponse);
