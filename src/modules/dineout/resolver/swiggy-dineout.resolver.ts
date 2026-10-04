import { Arg, Ctx, Mutation, Query, Resolver, UseMiddleware } from "type-graphql";
import { isCustomerAuthenticated } from "../../../middlewares/customer-auth";
import Context from "../../../types/context.type";
import { SwiggyConnectionService } from "../service/swiggy-connection.service";
import { DineoutToolsService } from "../service/dineout-tools.service";
import {
  SwiggyDineoutStatusResponse,
  DineoutRestaurant,
  DineoutSlotGroup,
  DineoutSearchResult,
  DineoutDetailsResult,
  DineoutSlotsResult,
  DineoutSavedLocationsResult,
  DineoutBookingResult,
  DineoutBookingStatusResult,
  DineoutBookingRecord,
  ReportDineoutErrorResult,
  DineoutTonightRailResult,
} from "../interfaces/dineout.objects";
import {
  DineoutSearchInput,
  DineoutRestaurantDetailsInput,
  DineoutSlotsInput,
  BookDineoutTableInput,
  ReportDineoutErrorInput,
  DineoutTonightRailInput,
} from "../interfaces/dineout.inputs";
import type { MappedRestaurant } from "../util/response-mapper";
import type { SlotGroup } from "../util/deals";
import {
  isSwiggyDineoutReady,
  SWIGGY_DINEOUT_DISABLED_MESSAGE,
} from "../config";

const toRestaurant = (m: MappedRestaurant): DineoutRestaurant => ({
  restaurantId: m.restaurantId,
  name: m.name,
  cuisines: m.cuisines,
  rating: m.rating,
  ratingCount: m.ratingCount,
  costForTwo: m.costForTwo,
  distance: m.distance,
  address: m.address,
  highlights: m.highlights,
  offers: m.offers,
  source: m.source,
  imageUrl: m.imageUrl,
  mastheadImages: m.mastheadImages,
});

const toSlotGroups = (groups: SlotGroup[]): DineoutSlotGroup[] =>
  groups.map((g) => ({
    name: g.name,
    slots: g.slots.map((s) => ({
      slotId: s.slotId,
      reservationTime: s.reservationTime,
      itemId: s.itemId,
      displayTime: s.displayTime,
      deals: s.deals.map((d) => ({
        title: d.title,
        itemId: d.itemId,
        slotId: d.slotId,
        bookingPrice: d.bookingPrice,
        displayFee: d.displayFee,
        discountPercentage: d.discountPercentage,
        isFree: d.isFree,
      })),
    })),
  }));

@Resolver()
export class SwiggyDineoutResolver {
  private readonly connections = new SwiggyConnectionService();
  private readonly tools = new DineoutToolsService();

  // ── Connection (Phase 0) ────────────────────────────────────────────────

  @Query(() => SwiggyDineoutStatusResponse)
  @UseMiddleware(isCustomerAuthenticated)
  async swiggyDineoutStatus(
    @Ctx() ctx: Context
  ): Promise<SwiggyDineoutStatusResponse> {
    if (!isSwiggyDineoutReady()) return { connected: false };
    const s = await this.connections.getStatus(ctx.customerId as string);
    return {
      connected: s.connected,
      status: s.status ?? undefined,
      expiresAt: s.expiresAt ?? undefined,
    };
  }

  @Mutation(() => Boolean)
  @UseMiddleware(isCustomerAuthenticated)
  async disconnectSwiggy(@Ctx() ctx: Context): Promise<boolean> {
    await this.connections.disconnect(ctx.customerId as string);
    return true;
  }

  // ── Discovery (Phase 1) ─────────────────────────────────────────────────

  @Query(() => DineoutSearchResult)
  @UseMiddleware(isCustomerAuthenticated)
  async searchDineoutRestaurants(
    @Ctx() ctx: Context,
    @Arg("input") input: DineoutSearchInput
  ): Promise<DineoutSearchResult> {
    if (!isSwiggyDineoutReady()) {
      return {
        needsSwiggyAuth: false,
        error: SWIGGY_DINEOUT_DISABLED_MESSAGE,
        restaurants: [],
      };
    }
    const r = await this.tools.searchRestaurants(ctx.customerId as string, input);
    if (r.needsSwiggyAuth) return { needsSwiggyAuth: true, restaurants: [] };
    if (r.error) return { needsSwiggyAuth: false, error: r.error, restaurants: [] };
    return { needsSwiggyAuth: false, restaurants: r.data.map(toRestaurant) };
  }

  @Query(() => DineoutDetailsResult)
  @UseMiddleware(isCustomerAuthenticated)
  async dineoutRestaurantDetails(
    @Ctx() ctx: Context,
    @Arg("input") input: DineoutRestaurantDetailsInput
  ): Promise<DineoutDetailsResult> {
    if (!isSwiggyDineoutReady()) {
      return {
        needsSwiggyAuth: false,
        error: SWIGGY_DINEOUT_DISABLED_MESSAGE,
      };
    }
    const r = await this.tools.getRestaurantDetails(ctx.customerId as string, input);
    if (r.needsSwiggyAuth) return { needsSwiggyAuth: true };
    if (r.error) return { needsSwiggyAuth: false, error: r.error };
    return {
      needsSwiggyAuth: false,
      restaurant: r.data ? toRestaurant(r.data) : undefined,
    };
  }

  @Query(() => DineoutSlotsResult)
  @UseMiddleware(isCustomerAuthenticated)
  async dineoutAvailableSlots(
    @Ctx() ctx: Context,
    @Arg("input") input: DineoutSlotsInput
  ): Promise<DineoutSlotsResult> {
    if (!isSwiggyDineoutReady()) {
      return {
        needsSwiggyAuth: false,
        error: SWIGGY_DINEOUT_DISABLED_MESSAGE,
        slotGroups: [],
      };
    }
    const r = await this.tools.getAvailableSlots(ctx.customerId as string, input);
    if (r.needsSwiggyAuth) return { needsSwiggyAuth: true, slotGroups: [] };
    if (r.error) return { needsSwiggyAuth: false, error: r.error, slotGroups: [] };
    return { needsSwiggyAuth: false, slotGroups: toSlotGroups(r.data) };
  }

  @Query(() => DineoutSavedLocationsResult)
  @UseMiddleware(isCustomerAuthenticated)
  async dineoutSavedLocations(
    @Ctx() ctx: Context
  ): Promise<DineoutSavedLocationsResult> {
    if (!isSwiggyDineoutReady()) {
      return {
        needsSwiggyAuth: false,
        error: SWIGGY_DINEOUT_DISABLED_MESSAGE,
        locations: [],
      };
    }
    const r = await this.tools.getSavedLocations(ctx.customerId as string);
    if (r.needsSwiggyAuth) return { needsSwiggyAuth: true, locations: [] };
    if (r.error) return { needsSwiggyAuth: false, error: r.error, locations: [] };
    return {
      needsSwiggyAuth: false,
      locations: r.data.map((l) => ({
        id: l.id,
        addressLine: l.addressLine,
        latitude: l.lat,
        longitude: l.lng,
      })),
    };
  }

  @Query(() => DineoutTonightRailResult)
  @UseMiddleware(isCustomerAuthenticated)
  async dineoutTonightRail(
    @Ctx() ctx: Context,
    @Arg("input") input: DineoutTonightRailInput
  ): Promise<DineoutTonightRailResult> {
    if (!isSwiggyDineoutReady()) {
      return {
        needsSwiggyAuth: false,
        error: SWIGGY_DINEOUT_DISABLED_MESSAGE,
        restaurants: [],
      };
    }
    const r = await this.tools.railTonight(ctx.customerId as string, input);
    if (r.needsSwiggyAuth) return { needsSwiggyAuth: true, restaurants: [] };
    if (r.error) return { needsSwiggyAuth: false, error: r.error, restaurants: [] };
    return { needsSwiggyAuth: false, restaurants: (r.data ?? []).map(toRestaurant) };
  }

  // ── Reservation (Phase 2) ───────────────────────────────────────────────

  @Mutation(() => DineoutBookingResult)
  @UseMiddleware(isCustomerAuthenticated)
  async bookDineoutTable(
    @Ctx() ctx: Context,
    @Arg("input") input: BookDineoutTableInput
  ): Promise<DineoutBookingResult> {
    if (!isSwiggyDineoutReady()) {
      return {
        needsSwiggyAuth: false,
        confirming: false,
        error: SWIGGY_DINEOUT_DISABLED_MESSAGE,
      };
    }
    const r = await this.tools.bookTable(ctx.customerId as string, input);
    if (r.needsSwiggyAuth)
      return { needsSwiggyAuth: true, confirming: false };
    if (r.error)
      return { needsSwiggyAuth: false, confirming: false, error: r.error };
    if (r.confirming)
      return { needsSwiggyAuth: false, confirming: true };
    return {
      needsSwiggyAuth: false,
      confirming: false,
      booking: r.booking ?? undefined,
    };
  }

  // ── Management (Phase 3) ────────────────────────────────────────────────

  @Query(() => DineoutBookingStatusResult)
  @UseMiddleware(isCustomerAuthenticated)
  async dineoutBookingStatus(
    @Ctx() ctx: Context,
    @Arg("orderId") orderId: string
  ): Promise<DineoutBookingStatusResult> {
    if (!isSwiggyDineoutReady()) {
      return {
        needsSwiggyAuth: false,
        error: SWIGGY_DINEOUT_DISABLED_MESSAGE,
      };
    }
    const r = await this.tools.getBookingStatus(ctx.customerId as string, orderId);
    if (r.needsSwiggyAuth) return { needsSwiggyAuth: true };
    if (r.error) return { needsSwiggyAuth: false, error: r.error };
    return { needsSwiggyAuth: false, booking: r.data ?? undefined };
  }

  @Query(() => [DineoutBookingRecord])
  @UseMiddleware(isCustomerAuthenticated)
  async myDineoutBookings(
    @Ctx() ctx: Context
  ): Promise<DineoutBookingRecord[]> {
    if (!isSwiggyDineoutReady()) return [];
    const rows = await this.tools.myBookings(ctx.customerId as string);
    return rows.map((b: any) => ({
      swiggyOrderId: b.swiggyOrderId,
      restaurantName: b.restaurantName,
      restaurantAddress: b.restaurantAddress,
      reservationTime: b.reservationTime,
      guestCount: b.guestCount,
      status: b.status,
      createdAt: b.createdAt,
    }));
  }

  @Mutation(() => ReportDineoutErrorResult)
  @UseMiddleware(isCustomerAuthenticated)
  async reportDineoutError(
    @Ctx() ctx: Context,
    @Arg("input") input: ReportDineoutErrorInput
  ): Promise<ReportDineoutErrorResult> {
    if (!isSwiggyDineoutReady()) {
      return {
        needsSwiggyAuth: false,
        error: SWIGGY_DINEOUT_DISABLED_MESSAGE,
      };
    }
    const r = await this.tools.reportError(ctx.customerId as string, input);
    if (r.needsSwiggyAuth) return { needsSwiggyAuth: true };
    if (r.error) return { needsSwiggyAuth: false, error: r.error };
    return {
      needsSwiggyAuth: false,
      reportLink: r.reportLink ?? undefined,
      message: r.message ?? undefined,
    };
  }
}
