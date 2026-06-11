"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvers = void 0;
const artist_follow_resolver_1 = require("../modules/artistFollow/resolver/artist-follow.resolver");
const artist_merch_order_resolver_1 = require("../modules/artistMerchOrder/resolver/artist-merch-order.resolver");
const auth_resolver_1 = require("../modules/auth/resolver/auth.resolver");
const cart_resolver_1 = require("../modules/cart/resolver/cart.resolver");
const customer_resolver_1 = require("../modules/customer/resolver/customer.resolver");
const customer_instagram_resolver_1 = require("../modules/customerInstagram/resolver/customer-instagram.resolver");
const customer_places_resolver_1 = require("../modules/customerPlaces/resolver/customer-places.resolver");
const event_resolver_1 = require("../modules/event/resolver/event.resolver");
const masters_resolver_1 = require("../modules/masters/resolver/masters.resolver");
const order_resolver_1 = require("../modules/order/resolver/order.resolver");
const feedback_resolver_1 = require("../modules/feedback/resolver/feedback.resolver");
const scanner_resolver_1 = require("../modules/scanner/resolver/scanner.resolver");
exports.resolvers = [
    auth_resolver_1.AuthResolver,
    customer_resolver_1.CustomerResolver,
    customer_instagram_resolver_1.CustomerInstagramResolver,
    customer_places_resolver_1.CustomerPlacesResolver,
    event_resolver_1.PublicEventResolver,
    masters_resolver_1.MastersResolver,
    cart_resolver_1.CartResolver,
    order_resolver_1.OrderResolver,
    feedback_resolver_1.CustomerFeedbackResolver,
    scanner_resolver_1.ScannerResolver,
    artist_follow_resolver_1.ArtistFollowResolver,
    artist_merch_order_resolver_1.ArtistMerchOrderResolver,
];
