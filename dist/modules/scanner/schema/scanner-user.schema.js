"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScannerUserModel = exports.ScannerUser = void 0;
const shared_1 = require("@hoizr-technology/shared");
Object.defineProperty(exports, "ScannerUser", { enumerable: true, get: function () { return shared_1.ScannerUser; } });
const typegoose_1 = require("@typegoose/typegoose");
const ScannerUserModel = (0, typegoose_1.getModelForClass)(shared_1.ScannerUser, {
    schemaOptions: { timestamps: true, collection: "scannerusers" },
});
exports.ScannerUserModel = ScannerUserModel;
