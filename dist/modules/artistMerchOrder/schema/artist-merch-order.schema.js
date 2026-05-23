"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArtistMerchOrder = exports.ArtistMerchOrderModel = void 0;
const typegoose_1 = require("@typegoose/typegoose");
const shared_1 = require("@hoizr-technology/shared");
Object.defineProperty(exports, "ArtistMerchOrder", { enumerable: true, get: function () { return shared_1.ArtistMerchOrder; } });
exports.ArtistMerchOrderModel = (0, typegoose_1.getModelForClass)(shared_1.ArtistMerchOrder, {
    schemaOptions: { timestamps: true },
});
