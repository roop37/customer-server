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
exports.OfflineScanResult = exports.ScannerManifest = exports.ScannerManifestEntry = exports.ScannerEventSummary = exports.ScanTicketResponse = exports.ScannedOrderSummary = exports.ScannedExtraLine = exports.ScannedTicketLine = exports.ScannerRefreshResponse = exports.ScannerLoginResponse = exports.ScanResultStatus = void 0;
const type_graphql_1 = require("type-graphql");
var ScanResultStatus;
(function (ScanResultStatus) {
    ScanResultStatus["OK"] = "OK";
    ScanResultStatus["ALREADY_CHECKED_IN"] = "ALREADY_CHECKED_IN";
    ScanResultStatus["WRONG_EVENT"] = "WRONG_EVENT";
    ScanResultStatus["ORDER_NOT_FOUND"] = "ORDER_NOT_FOUND";
    ScanResultStatus["PAYMENT_INCOMPLETE"] = "PAYMENT_INCOMPLETE";
    ScanResultStatus["CANCELLED"] = "CANCELLED";
    ScanResultStatus["REFUNDED"] = "REFUNDED";
    ScanResultStatus["INVALID_QR"] = "INVALID_QR";
    ScanResultStatus["SCANNER_INACTIVE"] = "SCANNER_INACTIVE";
    ScanResultStatus["EVENT_NOT_STARTED"] = "EVENT_NOT_STARTED";
    ScanResultStatus["EVENT_ENDED"] = "EVENT_ENDED";
})(ScanResultStatus || (exports.ScanResultStatus = ScanResultStatus = {}));
(0, type_graphql_1.registerEnumType)(ScanResultStatus, { name: "ScanResultStatus" });
let ScannerLoginResponse = class ScannerLoginResponse {
};
exports.ScannerLoginResponse = ScannerLoginResponse;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], ScannerLoginResponse.prototype, "scannerId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], ScannerLoginResponse.prototype, "eventId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], ScannerLoginResponse.prototype, "businessId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], ScannerLoginResponse.prototype, "scannerName", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], ScannerLoginResponse.prototype, "scannerType", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], ScannerLoginResponse.prototype, "accessToken", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], ScannerLoginResponse.prototype, "refreshToken", void 0);
exports.ScannerLoginResponse = ScannerLoginResponse = __decorate([
    (0, type_graphql_1.ObjectType)()
], ScannerLoginResponse);
/**
 * Response from a refresh-token swap. Smaller than the login response —
 * the scanner already knows its identity, all it needs are fresh tokens.
 */
let ScannerRefreshResponse = class ScannerRefreshResponse {
};
exports.ScannerRefreshResponse = ScannerRefreshResponse;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], ScannerRefreshResponse.prototype, "accessToken", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], ScannerRefreshResponse.prototype, "refreshToken", void 0);
exports.ScannerRefreshResponse = ScannerRefreshResponse = __decorate([
    (0, type_graphql_1.ObjectType)()
], ScannerRefreshResponse);
let ScannedTicketLine = class ScannedTicketLine {
};
exports.ScannedTicketLine = ScannedTicketLine;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], ScannedTicketLine.prototype, "ticketName", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => type_graphql_1.Int),
    __metadata("design:type", Number)
], ScannedTicketLine.prototype, "quantity", void 0);
exports.ScannedTicketLine = ScannedTicketLine = __decorate([
    (0, type_graphql_1.ObjectType)()
], ScannedTicketLine);
let ScannedExtraLine = class ScannedExtraLine {
};
exports.ScannedExtraLine = ScannedExtraLine;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], ScannedExtraLine.prototype, "extraName", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => type_graphql_1.Int),
    __metadata("design:type", Number)
], ScannedExtraLine.prototype, "quantity", void 0);
exports.ScannedExtraLine = ScannedExtraLine = __decorate([
    (0, type_graphql_1.ObjectType)()
], ScannedExtraLine);
let ScannedOrderSummary = class ScannedOrderSummary {
};
exports.ScannedOrderSummary = ScannedOrderSummary;
__decorate([
    (0, type_graphql_1.Field)(() => type_graphql_1.ID),
    __metadata("design:type", String)
], ScannedOrderSummary.prototype, "orderId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], ScannedOrderSummary.prototype, "customerName", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], ScannedOrderSummary.prototype, "customerPhone", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => [ScannedTicketLine]),
    __metadata("design:type", Array)
], ScannedOrderSummary.prototype, "tickets", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => [ScannedExtraLine], { nullable: true }),
    __metadata("design:type", Array)
], ScannedOrderSummary.prototype, "extras", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => type_graphql_1.Int),
    __metadata("design:type", Number)
], ScannedOrderSummary.prototype, "totalTickets", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Date),
    __metadata("design:type", Date)
], ScannedOrderSummary.prototype, "checkedInAt", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Date, { nullable: true }),
    __metadata("design:type", Date)
], ScannedOrderSummary.prototype, "previousCheckInAt", void 0);
exports.ScannedOrderSummary = ScannedOrderSummary = __decorate([
    (0, type_graphql_1.ObjectType)()
], ScannedOrderSummary);
let ScanTicketResponse = class ScanTicketResponse {
};
exports.ScanTicketResponse = ScanTicketResponse;
__decorate([
    (0, type_graphql_1.Field)(() => ScanResultStatus),
    __metadata("design:type", String)
], ScanTicketResponse.prototype, "status", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], ScanTicketResponse.prototype, "message", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => ScannedOrderSummary, { nullable: true }),
    __metadata("design:type", ScannedOrderSummary)
], ScanTicketResponse.prototype, "order", void 0);
exports.ScanTicketResponse = ScanTicketResponse = __decorate([
    (0, type_graphql_1.ObjectType)()
], ScanTicketResponse);
let ScannerEventSummary = class ScannerEventSummary {
};
exports.ScannerEventSummary = ScannerEventSummary;
__decorate([
    (0, type_graphql_1.Field)(() => type_graphql_1.ID),
    __metadata("design:type", String)
], ScannerEventSummary.prototype, "eventId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], ScannerEventSummary.prototype, "title", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Date, { nullable: true }),
    __metadata("design:type", Date)
], ScannerEventSummary.prototype, "startDate", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Date, { nullable: true }),
    __metadata("design:type", Date)
], ScannerEventSummary.prototype, "endDate", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], ScannerEventSummary.prototype, "city", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => type_graphql_1.Int),
    __metadata("design:type", Number)
], ScannerEventSummary.prototype, "totalScanned", void 0);
exports.ScannerEventSummary = ScannerEventSummary = __decorate([
    (0, type_graphql_1.ObjectType)()
], ScannerEventSummary);
// AUDIT-016: offline manifest — one cached, scannable ticket.
let ScannerManifestEntry = class ScannerManifestEntry {
};
exports.ScannerManifestEntry = ScannerManifestEntry;
__decorate([
    (0, type_graphql_1.Field)(() => type_graphql_1.ID),
    __metadata("design:type", String)
], ScannerManifestEntry.prototype, "orderId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], ScannerManifestEntry.prototype, "qrCodeData", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], ScannerManifestEntry.prototype, "customerName", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], ScannerManifestEntry.prototype, "customerPhone", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => [ScannedTicketLine]),
    __metadata("design:type", Array)
], ScannerManifestEntry.prototype, "tickets", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => type_graphql_1.Int),
    __metadata("design:type", Number)
], ScannerManifestEntry.prototype, "totalTickets", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Boolean),
    __metadata("design:type", Boolean)
], ScannerManifestEntry.prototype, "checkedIn", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Date, { nullable: true }),
    __metadata("design:type", Date)
], ScannerManifestEntry.prototype, "checkedInAt", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Boolean),
    __metadata("design:type", Boolean)
], ScannerManifestEntry.prototype, "refunded", void 0);
exports.ScannerManifestEntry = ScannerManifestEntry = __decorate([
    (0, type_graphql_1.ObjectType)()
], ScannerManifestEntry);
let ScannerManifest = class ScannerManifest {
};
exports.ScannerManifest = ScannerManifest;
__decorate([
    (0, type_graphql_1.Field)(() => type_graphql_1.ID),
    __metadata("design:type", String)
], ScannerManifest.prototype, "eventId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], ScannerManifest.prototype, "title", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Date, { nullable: true }),
    __metadata("design:type", Date)
], ScannerManifest.prototype, "startDate", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Date, { nullable: true }),
    __metadata("design:type", Date)
], ScannerManifest.prototype, "endDate", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Date),
    __metadata("design:type", Date)
], ScannerManifest.prototype, "generatedAt", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => [ScannerManifestEntry]),
    __metadata("design:type", Array)
], ScannerManifest.prototype, "entries", void 0);
exports.ScannerManifest = ScannerManifest = __decorate([
    (0, type_graphql_1.ObjectType)()
], ScannerManifest);
// AUDIT-016: per-item result of replaying a queued offline scan.
let OfflineScanResult = class OfflineScanResult {
};
exports.OfflineScanResult = OfflineScanResult;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], OfflineScanResult.prototype, "qrCodeData", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => ScanResultStatus),
    __metadata("design:type", String)
], OfflineScanResult.prototype, "status", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], OfflineScanResult.prototype, "message", void 0);
exports.OfflineScanResult = OfflineScanResult = __decorate([
    (0, type_graphql_1.ObjectType)()
], OfflineScanResult);
