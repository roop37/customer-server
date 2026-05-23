"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OtpModel = exports.Otp = void 0;
const shared_1 = require("@hoizr-technology/shared");
Object.defineProperty(exports, "Otp", { enumerable: true, get: function () { return shared_1.Otp; } });
const typegoose_1 = require("@typegoose/typegoose");
const OtpModel = (0, typegoose_1.getModelForClass)(shared_1.Otp, {
    schemaOptions: { timestamps: true },
});
exports.OtpModel = OtpModel;
