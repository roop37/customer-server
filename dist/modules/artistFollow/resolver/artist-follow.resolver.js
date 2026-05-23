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
exports.ArtistFollowResolver = void 0;
const shared_1 = require("@hoizr-technology/shared");
const type_graphql_1 = require("type-graphql");
const customer_auth_1 = require("../../../middlewares/customer-auth");
const artist_follow_service_1 = __importDefault(require("../service/artist-follow.service"));
let ArtistFollowResolver = class ArtistFollowResolver {
    constructor() {
        this.service = new artist_follow_service_1.default();
    }
    async followArtist(artistId, ctx) {
        return this.service.follow(artistId, ctx);
    }
    async unfollowArtist(artistId, ctx) {
        return this.service.unfollow(artistId, ctx);
    }
    async myFollowedArtists(ctx) {
        return this.service.listFollowedArtists(ctx);
    }
    async isFollowingArtist(artistId, ctx) {
        return this.service.isFollowing(artistId, ctx);
    }
};
exports.ArtistFollowResolver = ArtistFollowResolver;
__decorate([
    (0, type_graphql_1.Mutation)(() => shared_1.ArtistFollow),
    (0, type_graphql_1.UseMiddleware)(customer_auth_1.isCustomerAuthenticated),
    __param(0, (0, type_graphql_1.Arg)("artistId")),
    __param(1, (0, type_graphql_1.Ctx)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ArtistFollowResolver.prototype, "followArtist", null);
__decorate([
    (0, type_graphql_1.Mutation)(() => Boolean),
    (0, type_graphql_1.UseMiddleware)(customer_auth_1.isCustomerAuthenticated),
    __param(0, (0, type_graphql_1.Arg)("artistId")),
    __param(1, (0, type_graphql_1.Ctx)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ArtistFollowResolver.prototype, "unfollowArtist", null);
__decorate([
    (0, type_graphql_1.Query)(() => [shared_1.Artist]),
    (0, type_graphql_1.UseMiddleware)(customer_auth_1.isCustomerAuthenticated),
    __param(0, (0, type_graphql_1.Ctx)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ArtistFollowResolver.prototype, "myFollowedArtists", null);
__decorate([
    (0, type_graphql_1.Query)(() => Boolean),
    __param(0, (0, type_graphql_1.Arg)("artistId")),
    __param(1, (0, type_graphql_1.Ctx)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ArtistFollowResolver.prototype, "isFollowingArtist", null);
exports.ArtistFollowResolver = ArtistFollowResolver = __decorate([
    (0, type_graphql_1.Resolver)()
], ArtistFollowResolver);
