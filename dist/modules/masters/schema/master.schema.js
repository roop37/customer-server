"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IndianCityModel = exports.IndianCity = exports.GenreTagModel = exports.GenreTag = exports.EventCategoryModel = exports.EventCategory = void 0;
const shared_1 = require("@hoizr-technology/shared");
Object.defineProperty(exports, "EventCategory", { enumerable: true, get: function () { return shared_1.EventCategory; } });
Object.defineProperty(exports, "GenreTag", { enumerable: true, get: function () { return shared_1.GenreTag; } });
Object.defineProperty(exports, "IndianCity", { enumerable: true, get: function () { return shared_1.IndianCity; } });
const typegoose_1 = require("@typegoose/typegoose");
const EventCategoryModel = (0, typegoose_1.getModelForClass)(shared_1.EventCategory, {
    schemaOptions: { timestamps: true, collection: "eventcategories" },
});
exports.EventCategoryModel = EventCategoryModel;
const GenreTagModel = (0, typegoose_1.getModelForClass)(shared_1.GenreTag, {
    schemaOptions: { timestamps: true, collection: "genretags" },
});
exports.GenreTagModel = GenreTagModel;
const IndianCityModel = (0, typegoose_1.getModelForClass)(shared_1.IndianCity, {
    schemaOptions: { timestamps: true, collection: "indiancities" },
});
exports.IndianCityModel = IndianCityModel;
