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
exports.PublicEventResolver = void 0;
const shared_1 = require("@hoizr-technology/shared");
const type_graphql_1 = require("type-graphql");
const event_input_1 = require("../interfaces/event.input");
const event_objects_1 = require("../interfaces/event.objects");
const event_service_1 = __importDefault(require("../service/event.service"));
let PublicEventResolver = class PublicEventResolver {
    constructor() {
        this.service = new event_service_1.default();
    }
    async getPublishedEvents(input) {
        return this.service.getPublishedEvents(input ?? {});
    }
    async getPublicEventBySlug(slug) {
        return this.service.getEventBySlug(slug);
    }
    async getPublicEventById(id) {
        return this.service.getEventById(id);
    }
};
exports.PublicEventResolver = PublicEventResolver;
__decorate([
    (0, type_graphql_1.Query)(() => event_objects_1.PublicEventPaginatedResponse),
    __param(0, (0, type_graphql_1.Arg)("input", () => event_input_1.PublicEventFilterInput, { nullable: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [event_input_1.PublicEventFilterInput]),
    __metadata("design:returntype", Promise)
], PublicEventResolver.prototype, "getPublishedEvents", null);
__decorate([
    (0, type_graphql_1.Query)(() => shared_1.Event, { nullable: true }),
    __param(0, (0, type_graphql_1.Arg)("slug", () => String)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PublicEventResolver.prototype, "getPublicEventBySlug", null);
__decorate([
    (0, type_graphql_1.Query)(() => shared_1.Event, { nullable: true }),
    __param(0, (0, type_graphql_1.Arg)("id", () => String)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PublicEventResolver.prototype, "getPublicEventById", null);
exports.PublicEventResolver = PublicEventResolver = __decorate([
    (0, type_graphql_1.Resolver)()
], PublicEventResolver);
