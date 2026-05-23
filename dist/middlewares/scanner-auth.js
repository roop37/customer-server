"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isScannerAuthenticated = void 0;
const mercurius_1 = require("mercurius");
const isScannerAuthenticated = async ({ context }, next) => {
    if (!context.scannerId || !context.scannerEventId) {
        // `code: "UNAUTHENTICATED"` is surfaced via extensions to the client.
        // The Flutter scanner uses the code (not message substring matching)
        // to decide whether to attempt a refresh-and-retry. Don't rename
        // without updating hoizr-scanner-app/lib/services/graphql_service.dart.
        throw new mercurius_1.ErrorWithProps("Scanner not authenticated", {
            statusCode: 401,
            code: "UNAUTHENTICATED",
        });
    }
    return next();
};
exports.isScannerAuthenticated = isScannerAuthenticated;
