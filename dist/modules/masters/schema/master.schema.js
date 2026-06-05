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
exports.ProhibitedItemMasterModel = exports.ProhibitedItemMaster = exports.LanguageMasterModel = exports.LanguageMaster = exports.GenreTagModel = exports.GenreTag = exports.EventCategoryModel = exports.EventCategory = exports.CityModel = exports.City = void 0;
const shared_1 = require("@hoizr-technology/shared");
Object.defineProperty(exports, "EventCategory", { enumerable: true, get: function () { return shared_1.EventCategory; } });
Object.defineProperty(exports, "GenreTag", { enumerable: true, get: function () { return shared_1.GenreTag; } });
Object.defineProperty(exports, "LanguageMaster", { enumerable: true, get: function () { return shared_1.LanguageMaster; } });
Object.defineProperty(exports, "ProhibitedItemMaster", { enumerable: true, get: function () { return shared_1.ProhibitedItemMaster; } });
const typegoose_1 = require("@typegoose/typegoose");
const type_graphql_1 = require("type-graphql");
const EventCategoryModel = (0, typegoose_1.getModelForClass)(shared_1.EventCategory, {
    schemaOptions: { timestamps: true, collection: "eventcategories" },
});
exports.EventCategoryModel = EventCategoryModel;
const GenreTagModel = (0, typegoose_1.getModelForClass)(shared_1.GenreTag, {
    schemaOptions: { timestamps: true, collection: "genretags" },
});
exports.GenreTagModel = GenreTagModel;
const LanguageMasterModel = (0, typegoose_1.getModelForClass)(shared_1.LanguageMaster, {
    schemaOptions: { timestamps: true },
});
exports.LanguageMasterModel = LanguageMasterModel;
const ProhibitedItemMasterModel = (0, typegoose_1.getModelForClass)(shared_1.ProhibitedItemMaster, {
    schemaOptions: { timestamps: true },
});
exports.ProhibitedItemMasterModel = ProhibitedItemMasterModel;
let City = class City {
};
exports.City = City;
__decorate([
    (0, type_graphql_1.Field)(() => type_graphql_1.ID),
    __metadata("design:type", String)
], City.prototype, "_id", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    (0, typegoose_1.prop)({ required: true }),
    __metadata("design:type", String)
], City.prototype, "value", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    (0, typegoose_1.prop)({ required: true, unique: true }),
    __metadata("design:type", String)
], City.prototype, "cityId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    (0, typegoose_1.prop)({ required: true }),
    __metadata("design:type", String)
], City.prototype, "city", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    (0, typegoose_1.prop)(),
    __metadata("design:type", String)
], City.prototype, "district", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    (0, typegoose_1.prop)(),
    __metadata("design:type", String)
], City.prototype, "state", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Number, { nullable: true }),
    (0, typegoose_1.prop)(),
    __metadata("design:type", Number)
], City.prototype, "rank", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Number, { nullable: true }),
    (0, typegoose_1.prop)(),
    __metadata("design:type", Number)
], City.prototype, "latitude", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Number, { nullable: true }),
    (0, typegoose_1.prop)(),
    __metadata("design:type", Number)
], City.prototype, "longitude", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Boolean),
    (0, typegoose_1.prop)({ default: true }),
    __metadata("design:type", Boolean)
], City.prototype, "status", void 0);
exports.City = City = __decorate([
    (0, type_graphql_1.ObjectType)("IndianCity"),
    (0, typegoose_1.ModelOptions)({ options: { allowMixed: typegoose_1.Severity.ALLOW } })
], City);
const CityModel = (0, typegoose_1.getModelForClass)(City, {
    schemaOptions: { timestamps: true, collection: "cities" },
});
exports.CityModel = CityModel;
