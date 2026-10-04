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
exports.GenerateInvoiceResult = exports.CustomerOrderInvoice = exports.GuestCheckoutResponse = exports.PublicCoupon = exports.CouponPreviewView = exports.OfflinePaymentLinkView = exports.OfflineLinkLine = exports.CreateOrderResponse = exports.RazorpayCheckoutPayload = void 0;
const type_graphql_1 = require("type-graphql");
const cart_objects_1 = require("../../cart/interfaces/cart.objects");
const order_view_1 = require("./order.view");
let RazorpayCheckoutPayload = class RazorpayCheckoutPayload {
};
exports.RazorpayCheckoutPayload = RazorpayCheckoutPayload;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], RazorpayCheckoutPayload.prototype, "razorpayOrderId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], RazorpayCheckoutPayload.prototype, "razorpayKeyId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Number),
    __metadata("design:type", Number)
], RazorpayCheckoutPayload.prototype, "amount", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], RazorpayCheckoutPayload.prototype, "currency", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], RazorpayCheckoutPayload.prototype, "orderId", void 0);
exports.RazorpayCheckoutPayload = RazorpayCheckoutPayload = __decorate([
    (0, type_graphql_1.ObjectType)()
], RazorpayCheckoutPayload);
let CreateOrderResponse = class CreateOrderResponse {
};
exports.CreateOrderResponse = CreateOrderResponse;
__decorate([
    (0, type_graphql_1.Field)(() => order_view_1.CustomerOrderView),
    __metadata("design:type", order_view_1.CustomerOrderView)
], CreateOrderResponse.prototype, "order", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => RazorpayCheckoutPayload, { nullable: true }),
    __metadata("design:type", RazorpayCheckoutPayload)
], CreateOrderResponse.prototype, "checkout", void 0);
exports.CreateOrderResponse = CreateOrderResponse = __decorate([
    (0, type_graphql_1.ObjectType)()
], CreateOrderResponse);
let OfflineLinkLine = class OfflineLinkLine {
};
exports.OfflineLinkLine = OfflineLinkLine;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], OfflineLinkLine.prototype, "itemId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], OfflineLinkLine.prototype, "name", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Number),
    __metadata("design:type", Number)
], OfflineLinkLine.prototype, "quantity", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Number),
    __metadata("design:type", Number)
], OfflineLinkLine.prototype, "unitPrice", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Boolean),
    __metadata("design:type", Boolean)
], OfflineLinkLine.prototype, "isExtra", void 0);
exports.OfflineLinkLine = OfflineLinkLine = __decorate([
    (0, type_graphql_1.ObjectType)()
], OfflineLinkLine);
/** Prefill payload for a shared offline payment link (hoizr.com/t/<code>). */
let OfflinePaymentLinkView = class OfflinePaymentLinkView {
};
exports.OfflinePaymentLinkView = OfflinePaymentLinkView;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], OfflinePaymentLinkView.prototype, "offlineOrderId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], OfflinePaymentLinkView.prototype, "eventId", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], OfflinePaymentLinkView.prototype, "eventTitle", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], OfflinePaymentLinkView.prototype, "eventFlyer", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], OfflinePaymentLinkView.prototype, "eventSlug", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => [OfflineLinkLine]),
    __metadata("design:type", Array)
], OfflinePaymentLinkView.prototype, "lines", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Number),
    __metadata("design:type", Number)
], OfflinePaymentLinkView.prototype, "amountTotal", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], OfflinePaymentLinkView.prototype, "customerFirstName", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], OfflinePaymentLinkView.prototype, "customerLastName", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], OfflinePaymentLinkView.prototype, "customerEmail", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], OfflinePaymentLinkView.prototype, "customerPhone", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Boolean),
    __metadata("design:type", Boolean)
], OfflinePaymentLinkView.prototype, "alreadyPaid", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Boolean),
    __metadata("design:type", Boolean)
], OfflinePaymentLinkView.prototype, "expired", void 0);
exports.OfflinePaymentLinkView = OfflinePaymentLinkView = __decorate([
    (0, type_graphql_1.ObjectType)()
], OfflinePaymentLinkView);
/**
 * Result of validating a promo code at checkout (previewCoupon query).
 * `ok=false` carries a human `reason`; `ok=true` carries the discount and
 * the grand-total before/after so the UI can show the savings line without
 * re-deriving the pricing math (which lives server-side).
 */
let CouponPreviewView = class CouponPreviewView {
};
exports.CouponPreviewView = CouponPreviewView;
__decorate([
    (0, type_graphql_1.Field)(() => Boolean),
    __metadata("design:type", Boolean)
], CouponPreviewView.prototype, "ok", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CouponPreviewView.prototype, "code", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], CouponPreviewView.prototype, "reason", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Number),
    __metadata("design:type", Number)
], CouponPreviewView.prototype, "discountAmount", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Number),
    __metadata("design:type", Number)
], CouponPreviewView.prototype, "ticketsSubtotal", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Number),
    __metadata("design:type", Number)
], CouponPreviewView.prototype, "totalBefore", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Number),
    __metadata("design:type", Number)
], CouponPreviewView.prototype, "totalAfter", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => cart_objects_1.CartPricing, { nullable: true }),
    __metadata("design:type", cart_objects_1.CartPricing)
], CouponPreviewView.prototype, "pricing", void 0);
exports.CouponPreviewView = CouponPreviewView = __decorate([
    (0, type_graphql_1.ObjectType)()
], CouponPreviewView);
/**
 * A coupon the host chose to display publicly on the event page
 * (`showToCustomers`). Read-only marketing surface — customers copy the
 * `code` and apply it at checkout. Only active, in-window codes scoped to
 * this event (or host-global) are returned.
 */
let PublicCoupon = class PublicCoupon {
};
exports.PublicCoupon = PublicCoupon;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], PublicCoupon.prototype, "code", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], PublicCoupon.prototype, "description", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], PublicCoupon.prototype, "discountLabel", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Number, { nullable: true }),
    __metadata("design:type", Number)
], PublicCoupon.prototype, "minCartValue", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Date),
    __metadata("design:type", Date)
], PublicCoupon.prototype, "endDate", void 0);
exports.PublicCoupon = PublicCoupon = __decorate([
    (0, type_graphql_1.ObjectType)()
], PublicCoupon);
let GuestCheckoutResponse = class GuestCheckoutResponse {
};
exports.GuestCheckoutResponse = GuestCheckoutResponse;
__decorate([
    (0, type_graphql_1.Field)(() => order_view_1.CustomerOrderView),
    __metadata("design:type", order_view_1.CustomerOrderView)
], GuestCheckoutResponse.prototype, "order", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => RazorpayCheckoutPayload, { nullable: true }),
    __metadata("design:type", RazorpayCheckoutPayload)
], GuestCheckoutResponse.prototype, "checkout", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Boolean),
    __metadata("design:type", Boolean)
], GuestCheckoutResponse.prototype, "accountFound", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], GuestCheckoutResponse.prototype, "accountEmail", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Boolean),
    __metadata("design:type", Boolean)
], GuestCheckoutResponse.prototype, "loggedIn", void 0);
exports.GuestCheckoutResponse = GuestCheckoutResponse = __decorate([
    (0, type_graphql_1.ObjectType)()
], GuestCheckoutResponse);
/**
 * Customer-facing invoice download payload. The signed URL is minted
 * fresh on every request (Cloudinary `private_download_url`) and is
 * short-lived — long enough for the browser to fetch the PDF, short
 * enough that a leaked link goes stale within minutes.
 */
let CustomerOrderInvoice = class CustomerOrderInvoice {
};
exports.CustomerOrderInvoice = CustomerOrderInvoice;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CustomerOrderInvoice.prototype, "invoiceNumber", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], CustomerOrderInvoice.prototype, "pdfUrl", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Date),
    __metadata("design:type", Date)
], CustomerOrderInvoice.prototype, "expiresAt", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Date, { nullable: true }),
    __metadata("design:type", Date)
], CustomerOrderInvoice.prototype, "dateOfIssue", void 0);
exports.CustomerOrderInvoice = CustomerOrderInvoice = __decorate([
    (0, type_graphql_1.ObjectType)()
], CustomerOrderInvoice);
/**
 * Result of the on-demand "get-or-generate" invoice mutation.
 * `status` is one of:
 *  - "READY"               → `invoice` is populated with a freshly signed link.
 *  - "GENERATING"          → a worker is producing the PDF; client polls
 *                            getMyOrderInvoice until it lands.
 *  - "NO_INVOICE_FREE_ORDER" → a free / zero-booking-fee order has no tax
 *                            invoice to issue; `invoice` is null.
 */
let GenerateInvoiceResult = class GenerateInvoiceResult {
};
exports.GenerateInvoiceResult = GenerateInvoiceResult;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], GenerateInvoiceResult.prototype, "status", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => CustomerOrderInvoice, { nullable: true }),
    __metadata("design:type", CustomerOrderInvoice)
], GenerateInvoiceResult.prototype, "invoice", void 0);
exports.GenerateInvoiceResult = GenerateInvoiceResult = __decorate([
    (0, type_graphql_1.ObjectType)()
], GenerateInvoiceResult);
