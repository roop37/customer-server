"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomerModel = exports.Customer = void 0;
const shared_1 = require("@hoizr-technology/shared");
Object.defineProperty(exports, "Customer", { enumerable: true, get: function () { return shared_1.Customer; } });
const typegoose_1 = require("@typegoose/typegoose");
const CustomerModel = (0, typegoose_1.getModelForClass)(shared_1.Customer, {
    schemaOptions: { timestamps: true, collection: "customers" },
});
exports.CustomerModel = CustomerModel;
