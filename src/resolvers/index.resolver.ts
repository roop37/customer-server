import { NonEmptyArray } from "type-graphql";
import { ArtistFollowResolver } from "../modules/artistFollow/resolver/artist-follow.resolver";
import { ArtistMerchOrderResolver } from "../modules/artistMerchOrder/resolver/artist-merch-order.resolver";
import { AuthResolver } from "../modules/auth/resolver/auth.resolver";
import { CartResolver } from "../modules/cart/resolver/cart.resolver";
import { CustomerResolver } from "../modules/customer/resolver/customer.resolver";
import { CustomerInstagramResolver } from "../modules/customerInstagram/resolver/customer-instagram.resolver";
import { CustomerPlacesResolver } from "../modules/customerPlaces/resolver/customer-places.resolver";
import { PublicEventResolver } from "../modules/event/resolver/event.resolver";
import { PublicVenueResolver } from "../modules/venue/resolver/venue.resolver";
import { MastersResolver } from "../modules/masters/resolver/masters.resolver";
import { OrderResolver } from "../modules/order/resolver/order.resolver";
import { CustomerFeedbackResolver } from "../modules/feedback/resolver/feedback.resolver";
import { ScannerResolver } from "../modules/scanner/resolver/scanner.resolver";
import { GuestlistResolver } from "../modules/guestlist/resolver/guestlist.resolver";
import { CustomerLoyaltyResolver } from "../modules/loyalty/resolver/loyalty.resolver";

export const resolvers: NonEmptyArray<Function> = [
  AuthResolver,
  CustomerResolver,
  CustomerInstagramResolver,
  CustomerPlacesResolver,
  PublicEventResolver,
  PublicVenueResolver,
  MastersResolver,
  CartResolver,
  OrderResolver,
  CustomerFeedbackResolver,
  ScannerResolver,
  ArtistFollowResolver,
  ArtistMerchOrderResolver,
  GuestlistResolver,
  CustomerLoyaltyResolver,
];
