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
exports.ScannerResolver = void 0;
const type_graphql_1 = require("type-graphql");
const scanner_auth_1 = require("../../../middlewares/scanner-auth");
const scanner_input_1 = require("../interfaces/scanner.input");
const scanner_objects_1 = require("../interfaces/scanner.objects");
const scanner_service_1 = __importDefault(require("../service/scanner.service"));
let ScannerResolver = class ScannerResolver {
    constructor() {
        this.service = new scanner_service_1.default();
    }
    async scannerLogin(input) {
        return this.service.login(input);
    }
    /**
     * Swap a long-lived scanner refresh token for a fresh access+refresh
     * pair. Mirrors the customer / host refresh flow. No middleware — the
     * refresh token is the authentication for this endpoint; the service
     * verifies it against the DB-tied `authTokenVersion`.
     */
    async scannerTokenRefresh(refreshToken) {
        return this.service.refreshTokens(refreshToken);
    }
    async scannerEventSummary(ctx) {
        return this.service.getEventSummary(ctx);
    }
    async scanTicket(input, ctx) {
        return this.service.scanTicket(input, ctx);
    }
};
exports.ScannerResolver = ScannerResolver;
__decorate([
    (0, type_graphql_1.Mutation)(() => scanner_objects_1.ScannerLoginResponse),
    __param(0, (0, type_graphql_1.Arg)("input")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [scanner_input_1.ScannerLoginInput]),
    __metadata("design:returntype", Promise)
], ScannerResolver.prototype, "scannerLogin", null);
__decorate([
    (0, type_graphql_1.Mutation)(() => scanner_objects_1.ScannerRefreshResponse),
    __param(0, (0, type_graphql_1.Arg)("refreshToken")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ScannerResolver.prototype, "scannerTokenRefresh", null);
__decorate([
    (0, type_graphql_1.Query)(() => scanner_objects_1.ScannerEventSummary),
    (0, type_graphql_1.UseMiddleware)(scanner_auth_1.isScannerAuthenticated),
    __param(0, (0, type_graphql_1.Ctx)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ScannerResolver.prototype, "scannerEventSummary", null);
__decorate([
    (0, type_graphql_1.Mutation)(() => scanner_objects_1.ScanTicketResponse),
    (0, type_graphql_1.UseMiddleware)(scanner_auth_1.isScannerAuthenticated),
    __param(0, (0, type_graphql_1.Arg)("input")),
    __param(1, (0, type_graphql_1.Ctx)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [scanner_input_1.ScanTicketInput, Object]),
    __metadata("design:returntype", Promise)
], ScannerResolver.prototype, "scanTicket", null);
exports.ScannerResolver = ScannerResolver = __decorate([
    (0, type_graphql_1.Resolver)()
], ScannerResolver);
