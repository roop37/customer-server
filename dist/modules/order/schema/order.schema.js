"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderModel = exports.Order = void 0;
const shared_1 = require("@hoizr-technology/shared");
Object.defineProperty(exports, "Order", { enumerable: true, get: function () { return shared_1.Order; } });
const typegoose_1 = require("@typegoose/typegoose");
const OrderModel = (0, typegoose_1.getModelForClass)(shared_1.Order, {
    schemaOptions: { timestamps: true, collection: "orders" },
});
exports.OrderModel = OrderModel;
