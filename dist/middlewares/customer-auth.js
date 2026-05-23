"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCustomerAuthenticated = void 0;
const mercurius_1 = require("mercurius");
const isCustomerAuthenticated = async ({ context }, next) => {
    if (!context.customerId) {
        throw new mercurius_1.ErrorWithProps("Not authenticated", {
            statusCode: 401,
            code: "UNAUTHENTICATED",
        });
    }
    return next();
};
exports.isCustomerAuthenticated = isCustomerAuthenticated;
