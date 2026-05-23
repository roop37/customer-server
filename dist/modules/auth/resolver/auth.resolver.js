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
exports.AuthResolver = void 0;
const type_graphql_1 = require("type-graphql");
const cookie_1 = require("../../../utils/cookie");
const jwt_1 = require("../../../utils/jwt");
const auth_input_1 = require("../interfaces/auth.input");
const auth_objects_1 = require("../interfaces/auth.objects");
const auth_service_1 = __importDefault(require("../service/auth.service"));
const oauth_service_1 = __importDefault(require("../service/oauth.service"));
let AuthResolver = class AuthResolver {
    constructor() {
        this.service = new auth_service_1.default();
        this.oauth = new oauth_service_1.default();
    }
    async customerRequestOtp(input) {
        const otpId = await this.service.requestOtp(input);
        return { otpId };
    }
    async customerVerifyOtp(input, ctx) {
        const result = await this.service.verifyOtp(input);
        (0, cookie_1.setCustomerCookie)(cookie_1.CustomerCookieKeys.ACCESS_TOKEN, result.accessToken, ctx.rep);
        (0, cookie_1.setCustomerCookie)(cookie_1.CustomerCookieKeys.REFRESH_TOKEN, result.refreshToken, ctx.rep);
        (0, cookie_1.setCustomerCookie)(cookie_1.CustomerCookieKeys.UNIQUE_ID, result.uniqueId, ctx.rep);
        return {
            customerId: result.customerId,
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
        };
    }
    /**
     * Step 1 of Google sign-in. The frontend obtains a Google ID token
     * via @react-oauth/google and passes it here. Server verifies the
     * token and either logs the customer straight in (LOGGED_IN /
     * LINKED_EXISTING_BY_EMAIL) or returns a pending token so the client
     * can collect + verify the customer's phone via the pending-signup
     * mutations.
     */
    async customerGoogleStart(input, ctx) {
        const result = await this.oauth.googleStart(input);
        if ((result.outcome === auth_objects_1.GoogleStartOutcome.LOGGED_IN ||
            result.outcome === auth_objects_1.GoogleStartOutcome.LINKED_EXISTING_BY_EMAIL) &&
            result.accessToken &&
            result.refreshToken) {
            (0, cookie_1.setCustomerCookie)(cookie_1.CustomerCookieKeys.ACCESS_TOKEN, result.accessToken, ctx.rep);
            (0, cookie_1.setCustomerCookie)(cookie_1.CustomerCookieKeys.REFRESH_TOKEN, result.refreshToken, ctx.rep);
        }
        return result;
    }
    /**
     * Apple sign-in start. Wired but stubbed — throws
     * APPLE_NOT_CONFIGURED until creds land. See
     * /docs/APPLE_SIGN_IN_ENABLEMENT.md.
     */
    async customerAppleStart(input) {
        return this.oauth.appleStart(input);
    }
    async customerPendingSignupRequestOtp(input) {
        return this.oauth.pendingSignupRequestOtp(input);
    }
    async customerPendingSignupVerifyOtp(input, ctx) {
        const result = await this.oauth.pendingSignupVerifyOtp(input);
        (0, cookie_1.setCustomerCookie)(cookie_1.CustomerCookieKeys.ACCESS_TOKEN, result.accessToken, ctx.rep);
        (0, cookie_1.setCustomerCookie)(cookie_1.CustomerCookieKeys.REFRESH_TOKEN, result.refreshToken, ctx.rep);
        return result;
    }
    async customerTokenRefresh(ctx) {
        const refreshToken = (0, cookie_1.readTokenFromRequest)(ctx.req, cookie_1.CustomerCookieKeys.REFRESH_TOKEN);
        if (!refreshToken)
            return { success: false };
        const result = await (0, jwt_1.refreshCustomerAuthTokens)(refreshToken);
        if (!result)
            return { success: false };
        (0, cookie_1.setCustomerCookie)(cookie_1.CustomerCookieKeys.ACCESS_TOKEN, result.aToken, ctx.rep);
        (0, cookie_1.setCustomerCookie)(cookie_1.CustomerCookieKeys.REFRESH_TOKEN, result.rToken, ctx.rep);
        (0, cookie_1.setCustomerCookie)(cookie_1.CustomerCookieKeys.UNIQUE_ID, result.uniqueId, ctx.rep);
        return {
            success: true,
            accessToken: result.aToken,
            refreshToken: result.rToken,
        };
    }
    async customerLogout(ctx) {
        if (ctx.customerId) {
            const uniqueId = ctx.req.cookies?.[cookie_1.CustomerCookieKeys.UNIQUE_ID];
            if (uniqueId) {
                await (0, jwt_1.revokeCustomerRefreshToken)(ctx.customerId, uniqueId);
            }
        }
        (0, cookie_1.clearCustomerCookie)(cookie_1.CustomerCookieKeys.ACCESS_TOKEN, ctx.rep);
        (0, cookie_1.clearCustomerCookie)(cookie_1.CustomerCookieKeys.REFRESH_TOKEN, ctx.rep);
        (0, cookie_1.clearCustomerCookie)(cookie_1.CustomerCookieKeys.UNIQUE_ID, ctx.rep);
        return true;
    }
};
exports.AuthResolver = AuthResolver;
__decorate([
    (0, type_graphql_1.Mutation)(() => auth_objects_1.CustomerOtpResponse),
    __param(0, (0, type_graphql_1.Arg)("input")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_input_1.CustomerOtpRequestInput]),
    __metadata("design:returntype", Promise)
], AuthResolver.prototype, "customerRequestOtp", null);
__decorate([
    (0, type_graphql_1.Mutation)(() => auth_objects_1.CustomerAuthResponse),
    __param(0, (0, type_graphql_1.Arg)("input")),
    __param(1, (0, type_graphql_1.Ctx)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_input_1.CustomerOtpVerifyInput, Object]),
    __metadata("design:returntype", Promise)
], AuthResolver.prototype, "customerVerifyOtp", null);
__decorate([
    (0, type_graphql_1.Mutation)(() => auth_objects_1.CustomerGoogleStartResponse),
    __param(0, (0, type_graphql_1.Arg)("input")),
    __param(1, (0, type_graphql_1.Ctx)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_input_1.CustomerGoogleStartInput, Object]),
    __metadata("design:returntype", Promise)
], AuthResolver.prototype, "customerGoogleStart", null);
__decorate([
    (0, type_graphql_1.Mutation)(() => auth_objects_1.CustomerGoogleStartResponse),
    __param(0, (0, type_graphql_1.Arg)("input")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_input_1.CustomerAppleStartInput]),
    __metadata("design:returntype", Promise)
], AuthResolver.prototype, "customerAppleStart", null);
__decorate([
    (0, type_graphql_1.Mutation)(() => auth_objects_1.CustomerPendingSignupRequestOtpResponse),
    __param(0, (0, type_graphql_1.Arg)("input")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_input_1.CustomerPendingSignupRequestOtpInput]),
    __metadata("design:returntype", Promise)
], AuthResolver.prototype, "customerPendingSignupRequestOtp", null);
__decorate([
    (0, type_graphql_1.Mutation)(() => auth_objects_1.CustomerPendingSignupVerifyOtpResponse),
    __param(0, (0, type_graphql_1.Arg)("input")),
    __param(1, (0, type_graphql_1.Ctx)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_input_1.CustomerPendingSignupVerifyOtpInput, Object]),
    __metadata("design:returntype", Promise)
], AuthResolver.prototype, "customerPendingSignupVerifyOtp", null);
__decorate([
    (0, type_graphql_1.Mutation)(() => auth_objects_1.CustomerTokenRefreshResponse),
    __param(0, (0, type_graphql_1.Ctx)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthResolver.prototype, "customerTokenRefresh", null);
__decorate([
    (0, type_graphql_1.Mutation)(() => Boolean),
    __param(0, (0, type_graphql_1.Ctx)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthResolver.prototype, "customerLogout", null);
exports.AuthResolver = AuthResolver = __decorate([
    (0, type_graphql_1.Resolver)()
], AuthResolver);
