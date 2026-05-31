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
exports.MastersResolver = void 0;
const type_graphql_1 = require("type-graphql");
const master_schema_1 = require("../schema/master.schema");
let MastersResolver = class MastersResolver {
    async getActiveIndianCities() {
        return master_schema_1.CityModel.find({ status: true })
            .sort({ rank: 1, value: 1 })
            .lean();
    }
    async getActiveEventCategories() {
        return master_schema_1.EventCategoryModel.find({ status: true })
            .sort({ value: 1 })
            .lean();
    }
    async getActiveGenreTags() {
        return master_schema_1.GenreTagModel.find({ status: true })
            .sort({ value: 1 })
            .lean();
    }
};
exports.MastersResolver = MastersResolver;
__decorate([
    (0, type_graphql_1.Query)(() => [master_schema_1.City]),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], MastersResolver.prototype, "getActiveIndianCities", null);
__decorate([
    (0, type_graphql_1.Query)(() => [master_schema_1.EventCategory]),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], MastersResolver.prototype, "getActiveEventCategories", null);
__decorate([
    (0, type_graphql_1.Query)(() => [master_schema_1.GenreTag]),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], MastersResolver.prototype, "getActiveGenreTags", null);
exports.MastersResolver = MastersResolver = __decorate([
    (0, type_graphql_1.Resolver)()
], MastersResolver);
