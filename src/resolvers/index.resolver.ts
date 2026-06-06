import { NonEmptyArray } from "type-graphql";
import { ArtistFollowResolver } from "../modules/artistFollow/resolver/artist-follow.resolver";
import { ArtistMerchOrderResolver } from "../modules/artistMerchOrder/resolver/artist-merch-order.resolver";
import { AuthResolver } from "../modules/auth/resolver/auth.resolver";
import { CartResolver } from "../modules/cart/resolver/cart.resolver";
import { CustomerResolver } from "../modules/customer/resolver/customer.resolver";
import { CustomerInstagramResolver } from "../modules/customerInstagram/resolver/customer-instagram.resolver";
import { CustomerPlacesResolver } from "../modules/customerPlaces/resolver/customer-places.resolver";
import { PublicEventResolver } from "../modules/event/resolver/event.resolver";
import { MastersResolver } from "../modules/masters/resolver/masters.resolver";
import { OrderResolver } from "../modules/order/resolver/order.resolver";
import { ScannerResolver } from "../modules/scanner/resolver/scanner.resolver";

export const resolvers: NonEmptyArray<Function> = [
  AuthResolver,
  CustomerResolver,
  CustomerInstagramResolver,
  CustomerPlacesResolver,
  PublicEventResolver,
  MastersResolver,
  CartResolver,
  OrderResolver,
  ScannerResolver,
  ArtistFollowResolver,
  ArtistMerchOrderResolver,
];
