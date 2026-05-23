"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArtistFollow = exports.Artist = exports.ArtistFollowModel = exports.ArtistModel = void 0;
const typegoose_1 = require("@typegoose/typegoose");
const shared_1 = require("@hoizr-technology/shared");
Object.defineProperty(exports, "Artist", { enumerable: true, get: function () { return shared_1.Artist; } });
Object.defineProperty(exports, "ArtistFollow", { enumerable: true, get: function () { return shared_1.ArtistFollow; } });
exports.ArtistModel = (0, typegoose_1.getModelForClass)(shared_1.Artist, {
    schemaOptions: { timestamps: true },
});
exports.ArtistFollowModel = (0, typegoose_1.getModelForClass)(shared_1.ArtistFollow, {
    schemaOptions: { timestamps: true },
});
