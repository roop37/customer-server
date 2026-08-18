import crypto from "crypto";
import { redisClient } from "../../../utils/redis";
import {
  getSwiggyDineoutClient,
  buildBookingDedupeKey,
  RATE_LIMIT_MESSAGE,
  McpCallResult,
} from "../../../utils/swiggy-dineout.client";
import { SwiggyConnectionService } from "./swiggy-connection.service";
import { DineoutBookingModel } from "../schema/swiggy-dineout.schema";
import { logDineoutCall } from "../util/audit";
import { dispatchReservationNotification } from "../util/reservation-notify";
import {
  filterToFreeSlots,
  groupSlotsByBand,
  isBookableDeal,
  SlotGroup,
} from "../util/deals";
import {
  mapRestaurantList,
  mapRestaurantDetails,
  mapSlots,
  mapSavedLocations,
  mapBookingConfirmation,
  MappedRestaurant,
  MappedSavedLocation,
  MappedBookingConfirmation,
} from "../util/response-mapper";
import {
  isSwiggyDineoutReady,
  SWIGGY_DINEOUT_DISABLED_MESSAGE,
} from "../config";

/**
 * All Swiggy Dineout tool calls run through here (server-side only). Every
 * method resolves the per-user token, calls the tool, maps the response, and
 * writes a PII-free audit line. On a missing/expired token or a 401/419 it
 * returns { needsSwiggyAuth: true } so the client can prompt reconnect
 * instead of surfacing a hard error (spec §5.3).
 */

// Flat result (see McpCallResult note): strictNullChecks is off in this
// codebase, so a discriminated union would not narrow. Consumers check
// needsSwiggyAuth, then error, then use data.
type ToolResult<T> = {
  needsSwiggyAuth: boolean;
  error: string | null;
  data: T | null;
  // Set by searchRestaurants when enrichment hit a 429 and stopped early, so
  // callers (e.g. the shared rail cache) can avoid persisting a degraded fill.
  throttled?: boolean;
};

type BookTableInput = {
  restaurantId: string;
  slotId: number;
  itemId: string;
  reservationTime: number;
  guestCount: number;
  latitude: number;
  longitude: number;
  restaurantName?: string;
  restaurantAddress?: string;
};

const newSessionId = (): string => crypto.randomBytes(8).toString("hex");

const logMcpResult = (
  correlationId: string,
  tool: string,
  status: string,
  latencyMs: number,
  outcome: string,
  result: McpCallResult
): void => {
  logDineoutCall({
    sessionId: result.sessionId ?? correlationId,
    tool,
    status,
    latencyMs,
    outcome,
    rateLimit: result.rateLimit,
    deprecationDetected: Boolean(result.deprecation),
  });
};

const disabledToolResult = <T>(): ToolResult<T> => ({
  needsSwiggyAuth: false,
  error: SWIGGY_DINEOUT_DISABLED_MESSAGE,
  data: null,
});

export class DineoutToolsService {
  private readonly connections = new SwiggyConnectionService();
  private readonly client = getSwiggyDineoutClient();

  /** Shared: fetch token → call tool → classify → map. */
  private async callMapped<T>(
    customerId: string,
    tool: string,
    args: Record<string, unknown>,
    map: (data: any) => T
  ): Promise<ToolResult<T>> {
    if (!isSwiggyDineoutReady()) return disabledToolResult<T>();
    const sessionId = newSessionId();
    const token = await this.connections.getActiveToken(customerId);
    if (!token) {
      logDineoutCall({ sessionId, tool, status: "no_token", latencyMs: 0, outcome: "needs_auth" });
      return { needsSwiggyAuth: true, error: null, data: null };
    }
    const startedAt = Date.now();
    const res = await this.client.callTool(token, tool, args);
    const latencyMs = Date.now() - startedAt;

    if (res.ok) {
      logMcpResult(sessionId, tool, "ok", latencyMs, "ok", res);
      return { needsSwiggyAuth: false, error: null, data: map(res.data) };
    }
    // Auth/revoked → drop the token and prompt reconnect.
    if (res.klass === "auth" || res.klass === "revoked") {
      if (res.klass === "revoked") {
        await this.connections.markRevoked(customerId);
      } else {
        await this.connections.markExpired(customerId);
      }
      logMcpResult(
        sessionId,
        tool,
        res.klass,
        latencyMs,
        "needs_auth",
        res
      );
      return { needsSwiggyAuth: true, error: null, data: null };
    }
    logMcpResult(sessionId, tool, res.klass ?? "unknown", latencyMs, "error", res);
    return { needsSwiggyAuth: false, error: res.message, data: null };
  }

  // ── Phase 1: Discovery ──────────────────────────────────────────────────

  /**
   * Swiggy's search tool is text-only, so a small number of leading results
   * are enriched with a fresh details call. Do not cache tool responses:
   * pricing, offers and availability are volatile, and Swiggy's data rules
   * treat the whole response as per-user data.
   */
  private async detailsLive(
    customerId: string,
    restaurantId: string,
    latitude: number,
    longitude: number
  ): Promise<MappedRestaurant | null | "RATE_LIMITED"> {
    if (!isSwiggyDineoutReady()) return null;
    const r = await this.getRestaurantDetails(customerId, {
      restaurantId,
      latitude,
      longitude,
    });
    if (!r.needsSwiggyAuth && !r.error && r.data) return r.data;
    // Distinguish throttling so the enrichment loop can stop burning the
    // per-user budget (the reservation page needs the remaining headroom).
    if (r.error === RATE_LIMIT_MESSAGE) return "RATE_LIMITED";
    return null;
  }

  // Enrich only the leading cards. A search plus eight details calls leaves
  // substantial room inside the current 70 calls/min/user ceiling for slots
  // and booking, unlike the former 40-result fan-out.
  private static readonly ENRICH_MAX = 8;
  private static readonly ENRICH_BATCH = 4; // small paced waves — live 429s observed 2026-07-18
  private static readonly ENRICH_WAVE_GAP_MS = 400;

  async searchRestaurants(
    customerId: string,
    input: {
      query: string;
      entityType?: string;
      addressId?: string;
      latitude?: number;
      longitude?: number;
    },
    opts?: { enrichMax?: number }
  ): Promise<ToolResult<MappedRestaurant[]>> {
    if (!isSwiggyDineoutReady()) {
      return disabledToolResult<MappedRestaurant[]>();
    }
    const args: Record<string, unknown> = { query: input.query };
    if (input.entityType) args.entityType = input.entityType;
    if (input.addressId) args.addressId = input.addressId;
    if (input.latitude !== undefined) args.latitude = input.latitude;
    if (input.longitude !== undefined) args.longitude = input.longitude;
    const r = await this.callMapped(customerId, "search_restaurants_dineout", args, mapRestaurantList);
    if (!r.data) return r;
    // Faithful display, but drop restaurants explicitly not available (spec §7.2).
    let list = r.data.filter(
      (x) => !x.availability || x.availability.toUpperCase() === "AVAILABLE"
    );
    // Enrich the top results with details (images, rating, cost, cuisines).
    // Needs the search coords (details wants the SAME pair); the addressId
    // path resolves coords Swiggy-side, so nothing to enrich with there.
    if (input.latitude !== undefined && input.longitude !== undefined) {
      const head = list.slice(
        0,
        Math.min(opts?.enrichMax ?? DineoutToolsService.ENRICH_MAX, DineoutToolsService.ENRICH_MAX)
      );
      const details: (MappedRestaurant | null)[] = [];
      let wasThrottled = false;
      for (let i = 0; i < head.length; i += DineoutToolsService.ENRICH_BATCH) {
        const wave = await Promise.all(
          head
            .slice(i, i + DineoutToolsService.ENRICH_BATCH)
            .map((x) =>
              this.detailsLive(
                customerId,
                x.restaurantId,
                input.latitude!,
                input.longitude!
              ).catch((): null => null)
            )
        );
        const throttled = wave.some((w) => w === "RATE_LIMITED");
        details.push(
          ...wave.map((w): MappedRestaurant | null =>
            w === "RATE_LIMITED" ? null : w
          )
        );
        if (throttled) {
          wasThrottled = true;
          break; // stop burning the per-user budget
        }
        if (i + DineoutToolsService.ENRICH_BATCH < head.length) {
          await new Promise((r) =>
            setTimeout(r, DineoutToolsService.ENRICH_WAVE_GAP_MS)
          );
        }
      }
      list = list.map((x, i) => {
        const d = i < details.length ? details[i] : null;
        if (!d) return x;
        return {
          ...x,
          // Keep the search locality as the card address (short); take the
          // visual/richness fields from details.
          name: x.name ?? d.name,
          rating: x.rating ?? d.rating,
          ratingCount: x.ratingCount ?? d.ratingCount,
          costForTwo: x.costForTwo ?? d.costForTwo,
          cuisines: x.cuisines.length ? x.cuisines : d.cuisines,
          highlights: x.highlights.length ? x.highlights : d.highlights,
          offers: x.offers.length ? x.offers : d.offers,
          imageUrl: d.imageUrl,
          mastheadImages: d.mastheadImages,
        };
      });
      return { ...r, data: list, throttled: wasThrottled };
    }
    return { ...r, data: list };
  }

  // ── Tonight rail (home/live) ────────────────────────────────────────────

  /** Fresh, per-request rail; no Swiggy response is shared across customers. */
  private static readonly RAIL_SIZE = 8;

  async railTonight(
    customerId: string,
    input: { city: string; latitude: number; longitude: number }
  ): Promise<ToolResult<MappedRestaurant[]>> {
    if (!isSwiggyDineoutReady()) {
      return disabledToolResult<MappedRestaurant[]>();
    }
    const r = await this.searchRestaurants(
      customerId,
      {
        // "bar" is the broadest nightlife category Swiggy exposes.
        query: "bar",
        entityType: "RESTAURANT_CATEGORY",
        latitude: input.latitude,
        longitude: input.longitude,
      },
      { enrichMax: DineoutToolsService.RAIL_SIZE }
    );
    if (r.needsSwiggyAuth || r.error || !r.data) return r;
    const rail = r.data.slice(0, DineoutToolsService.RAIL_SIZE);
    return { needsSwiggyAuth: false, error: null, data: rail };
  }

  async getRestaurantDetails(
    customerId: string,
    input: { restaurantId: string; latitude: number; longitude: number }
  ): Promise<ToolResult<MappedRestaurant | null>> {
    if (!isSwiggyDineoutReady()) {
      return disabledToolResult<MappedRestaurant | null>();
    }
    return this.callMapped(
      customerId,
      "get_restaurant_details",
      { restaurantId: input.restaurantId, latitude: input.latitude, longitude: input.longitude },
      mapRestaurantDetails
    );
  }

  async getAvailableSlots(
    customerId: string,
    input: { restaurantId: string; date: string; latitude: number; longitude: number }
  ): Promise<ToolResult<SlotGroup[]>> {
    if (!isSwiggyDineoutReady()) return disabledToolResult<SlotGroup[]>();
    return this.callMapped(
      customerId,
      "get_available_slots",
      {
        restaurantId: input.restaurantId,
        date: input.date,
        latitude: input.latitude,
        longitude: input.longitude,
      },
      // LIVE API returns up to 7 days of slots — keep the requested date only,
      // then bookable-filter (free deal present) and band-group. IST upstream.
      (data) =>
        groupSlotsByBand(
          filterToFreeSlots(
            mapSlots(data).filter((s) => !s.dateStr || s.dateStr === input.date)
          )
        )
    );
  }

  async getSavedLocations(
    customerId: string
  ): Promise<ToolResult<MappedSavedLocation[]>> {
    if (!isSwiggyDineoutReady()) {
      return disabledToolResult<MappedSavedLocation[]>();
    }
    return this.callMapped(customerId, "get_saved_locations", {}, mapSavedLocations);
  }

  /**
   * Re-read the chosen slot immediately before booking and enforce the free
   * deal policy on the server. Paid deals are displayed faithfully, so the
   * browser-provided itemId cannot be trusted as an authorization decision.
   */
  private async validateFreshFreeDeal(
    customerId: string,
    token: string,
    input: BookTableInput
  ): Promise<{
    needsSwiggyAuth: boolean;
    error: string | null;
    allowed: boolean;
  }> {
    const sessionId = newSessionId();
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
    }).format(new Date(input.reservationTime * 1000));
    const startedAt = Date.now();
    const res = await this.client.callTool(token, "get_available_slots", {
      restaurantId: input.restaurantId,
      date,
      latitude: input.latitude,
      longitude: input.longitude,
    });
    const latencyMs = Date.now() - startedAt;

    if (!res.ok) {
      if (res.klass === "auth" || res.klass === "revoked") {
        if (res.klass === "revoked") {
          await this.connections.markRevoked(customerId);
        } else {
          await this.connections.markExpired(customerId);
        }
        logMcpResult(
          sessionId,
          "get_available_slots",
          res.klass,
          latencyMs,
          "needs_auth",
          res
        );
        return { needsSwiggyAuth: true, error: null, allowed: false };
      }
      logMcpResult(
        sessionId,
        "get_available_slots",
        res.klass ?? "unknown",
        latencyMs,
        "booking_validation_failed",
        res
      );
      return {
        needsSwiggyAuth: false,
        error: res.message ?? "Couldn't verify this table. Please refresh and try again.",
        allowed: false,
      };
    }

    const allowed = mapSlots(res.data).some(
      (slot) =>
        slot.slotId === input.slotId &&
        slot.reservationTime === input.reservationTime &&
        slot.deals.some(
          (deal) =>
            deal.itemId === input.itemId &&
            (deal.slotId === undefined || deal.slotId === input.slotId) &&
            isBookableDeal(deal)
        )
    );
    logMcpResult(
      sessionId,
      "get_available_slots",
      allowed ? "ok" : "not_free_or_stale",
      latencyMs,
      allowed ? "booking_validated" : "booking_rejected",
      res
    );
    return {
      needsSwiggyAuth: false,
      error: allowed
        ? null
        : "This deal is no longer available as a free reservation. Refresh the slots and choose again.",
      allowed,
    };
  }

  // ── Phase 2: Reservation ────────────────────────────────────────────────

  /**
   * book_table with the Hoizr-side duplicate-submit guard (spec §7.3):
   *  - Acquire a short-TTL Redis lock on customerId+restaurantId+slotId. If it
   *    is already held, a prior submit is in flight → return confirming=true,
   *    do NOT fire a second book_table.
   *  - On a clean success: persist DineoutBooking (successful only — L3) and
   *    return the confirmation.
   *  - On a retryable (5xx/upstream/internal) failure: do NOT blind-retry;
   *    return confirming=true so the UI moves to "we're confirming…" and the
   *    customer can check status / contact support. Keep the lock for its TTL.
   *  - On a hard failure (bad input etc.): release the lock, return the error.
   */
  async bookTable(
    customerId: string,
    input: BookTableInput
  ): Promise<{
    needsSwiggyAuth: boolean;
    error: string | null;
    confirming: boolean;
    booking: MappedBookingConfirmation | null;
  }> {
    if (!isSwiggyDineoutReady()) {
      return {
        needsSwiggyAuth: false,
        error: SWIGGY_DINEOUT_DISABLED_MESSAGE,
        confirming: false,
        booking: null,
      };
    }
    // Trust-boundary validation (Swiggy's verified limits) — reject before
    // spending a lock or a tool call on garbage input.
    if (
      !input.itemId ||
      !(input.reservationTime > 0) ||
      input.guestCount < 1 ||
      input.guestCount > 20
    ) {
      return {
        needsSwiggyAuth: false,
        error: "INVALID_BOOKING_INPUT",
        confirming: false,
        booking: null,
      };
    }

    const sessionId = newSessionId();
    const token = await this.connections.getActiveToken(customerId);
    if (!token) return { needsSwiggyAuth: true, error: null, confirming: false, booking: null };

    const eligibility = await this.validateFreshFreeDeal(
      customerId,
      token,
      input
    );
    if (eligibility.needsSwiggyAuth) {
      return {
        needsSwiggyAuth: true,
        error: null,
        confirming: false,
        booking: null,
      };
    }
    if (!eligibility.allowed) {
      return {
        needsSwiggyAuth: false,
        error: eligibility.error,
        confirming: false,
        booking: null,
      };
    }

    const lockKey = buildBookingDedupeKey({
      customerId,
      restaurantId: input.restaurantId,
      slotId: input.slotId,
    });
    // SET NX EX 60 — atomic acquire; if not acquired a submit is already in flight.
    const acquired = await redisClient.set(lockKey, sessionId, "EX", 60, "NX");
    if (acquired !== "OK") {
      return { needsSwiggyAuth: false, error: null, confirming: true, booking: null };
    }

    const startedAt = Date.now();
    const res = await this.client.callTool(token, "book_table", {
      restaurantId: input.restaurantId,
      slotId: input.slotId,
      itemId: input.itemId,
      reservationTime: input.reservationTime,
      guestCount: input.guestCount,
      latitude: input.latitude,
      longitude: input.longitude,
    }, { retries: 0 }); // non-idempotent: ambiguity → confirming path, never blind re-send
    const latencyMs = Date.now() - startedAt;

    if (res.ok) {
      const conf = mapBookingConfirmation(res.data);
      if (!conf) {
        // Success envelope but unrecognizable confirmation → treat as ambiguous.
        logMcpResult(
          sessionId,
          "book_table",
          "ok_no_conf",
          latencyMs,
          "confirming",
          res
        );
        return { needsSwiggyAuth: false, error: null, confirming: true, booking: null };
      }
      // Persist SUCCESSFUL booking only (L3). Never store failed/abandoned.
      // The reservation already exists at Swiggy — a persistence failure must
      // NOT surface as a booking error (the customer IS booked). Log and
      // return the confirmation regardless; the record can be reconciled via
      // get_booking_status later.
      try {
        await DineoutBookingModel.updateOne(
          { customerId, swiggyOrderId: conf.orderId },
          {
            $set: {
              restaurantName: input.restaurantName ?? conf.restaurantName ?? "Reservation",
              restaurantAddress: input.restaurantAddress ?? conf.restaurantAddress,
              reservationTime: new Date(
                (conf.reservationTime ?? input.reservationTime) * 1000
              ),
              guestCount: conf.guestCount ?? input.guestCount,
              status: conf.status ?? "CONFIRMED",
            },
            $setOnInsert: { customerId, swiggyOrderId: conf.orderId },
          },
          { upsert: true }
        );
      } catch {
        logDineoutCall({ sessionId, tool: "book_table", status: "persist_failed", latencyMs, outcome: "booked_unrecorded" });
      }
      await this.releaseBookingLock(lockKey, sessionId, latencyMs);
      logMcpResult(sessionId, "book_table", "ok", latencyMs, "booked", res);
      // Transactional confirmation (customer's own booking; gated + best-effort).
      void dispatchReservationNotification({
        customerId,
        kind: "confirmed",
        restaurantName: input.restaurantName ?? conf.restaurantName ?? "your table",
        restaurantAddress: input.restaurantAddress ?? conf.restaurantAddress,
        reservationTime: new Date(
          (conf.reservationTime ?? input.reservationTime) * 1000
        ),
        guestCount: conf.guestCount ?? input.guestCount,
        orderId: conf.orderId,
      }).catch((): undefined => undefined);
      return { needsSwiggyAuth: false, error: null, confirming: false, booking: conf };
    }

    if (res.klass === "auth" || res.klass === "revoked") {
      if (res.klass === "revoked") {
        await this.connections.markRevoked(customerId);
      } else {
        await this.connections.markExpired(customerId);
      }
      await this.releaseBookingLock(lockKey, sessionId, latencyMs);
      logMcpResult(
        sessionId,
        "book_table",
        res.klass,
        latencyMs,
        "needs_auth",
        res
      );
      return { needsSwiggyAuth: true, error: null, confirming: false, booking: null };
    }

    const responseOrderId =
      res.identifiers?.orderId ?? res.identifiers?.bookingId;
    const ambiguousWithOrderId =
      (res.klass === "upstream" || res.klass === "internal") &&
      Boolean(responseOrderId);
    const possibleDuplicate =
      res.possibleDuplicateRequest === true ||
      /(?:deal\s+already\s+purchased|duplicate\s+booking|already\s+booked)/i.test(
        res.message ?? ""
      );
    if (possibleDuplicate || ambiguousWithOrderId) {
      const reconciled = await this.reconcilePossibleDuplicate(
        customerId,
        input,
        responseOrderId
      );
      if (!reconciled.confirming) {
        await this.releaseBookingLock(lockKey, sessionId, latencyMs);
      } else {
        await this.retainBookingLock(lockKey, sessionId, latencyMs);
      }
      logMcpResult(
        sessionId,
        "book_table",
        reconciled.booking
          ? possibleDuplicate
            ? "duplicate_reconciled"
            : "ambiguous_reconciled"
          : possibleDuplicate
            ? "possible_duplicate"
            : "ambiguous_unresolved",
        latencyMs,
        reconciled.booking ? "booked" : "confirming",
        res
      );
      return reconciled;
    }

    // Retryable/ambiguous — do NOT auto-retry; hold the lock, ask the client to
    // reconcile via get_booking_status / support. (spec §7.3 conservative path)
    if (res.klass === "upstream" || res.klass === "internal") {
      await this.retainBookingLock(lockKey, sessionId, latencyMs);
      logMcpResult(
        sessionId,
        "book_table",
        res.klass,
        latencyMs,
        "confirming",
        res
      );
      return { needsSwiggyAuth: false, error: null, confirming: true, booking: null };
    }

    // Hard domain failure (bad input, slot gone, etc.) — release the lock.
    await this.releaseBookingLock(lockKey, sessionId, latencyMs);
    logMcpResult(
      sessionId,
      "book_table",
      res.klass ?? "unknown",
      latencyMs,
      "error",
      res
    );
    return { needsSwiggyAuth: false, error: res.message, confirming: false, booking: null };
  }

  // ── Phase 3: Management ─────────────────────────────────────────────────

  async getBookingStatus(
    customerId: string,
    orderId: string
  ): Promise<ToolResult<MappedBookingConfirmation | null>> {
    if (!isSwiggyDineoutReady()) {
      return disabledToolResult<MappedBookingConfirmation | null>();
    }
    const r = await this.callMapped(
      customerId,
      "get_booking_status",
      { orderId },
      mapBookingConfirmation
    );
    // Refresh our persisted record's status when we learn it (own-order tracking).
    if (r.needsSwiggyAuth === false && r.error === null && r.data?.status) {
      await DineoutBookingModel.updateOne(
        { customerId, swiggyOrderId: orderId },
        { $set: { status: r.data.status } }
      ).catch((): undefined => undefined);
    }
    return r;
  }

  /** My Reservations — reads our own segregated record; no Swiggy call needed. */
  async myBookings(customerId: string) {
    if (!isSwiggyDineoutReady()) return [];
    return DineoutBookingModel.find({ customerId }).sort({ createdAt: -1 }).lean();
  }

  async reportError(
    customerId: string,
    input: {
      tool: string;
      errorMessage: string;
      flowDescription?: string;
      userNotes?: string;
    }
  ): Promise<{
    needsSwiggyAuth: boolean;
    error: string | null;
    reportLink: string | null;
    message: string | null;
  }> {
    if (!isSwiggyDineoutReady()) {
      return {
        needsSwiggyAuth: false,
        error: SWIGGY_DINEOUT_DISABLED_MESSAGE,
        reportLink: null,
        message: null,
      };
    }
    const sessionId = newSessionId();
    const token = await this.connections.getActiveToken(customerId);
    if (!token) return { needsSwiggyAuth: true, error: null, reportLink: null, message: null };
    const res = await this.client.callTool(token, "report_error", {
      tool: input.tool,
      errorMessage: input.errorMessage,
      domain: "dineout",
      flowDescription: input.flowDescription,
      userNotes: input.userNotes,
    });
    if (res.ok) {
      logMcpResult(sessionId, "report_error", "ok", 0, "ok", res);
      return {
        needsSwiggyAuth: false,
        error: null,
        reportLink: res.data?.reportLink ?? null,
        message: res.data?.message ?? null,
      };
    }
    if (res.klass === "auth" || res.klass === "revoked") {
      if (res.klass === "revoked") {
        await this.connections.markRevoked(customerId);
      } else {
        await this.connections.markExpired(customerId);
      }
      logMcpResult(
        sessionId,
        "report_error",
        res.klass,
        0,
        "needs_auth",
        res
      );
      return { needsSwiggyAuth: true, error: null, reportLink: null, message: null };
    }
    logMcpResult(
      sessionId,
      "report_error",
      res.klass ?? "unknown",
      0,
      "error",
      res
    );
    return { needsSwiggyAuth: false, error: res.message, reportLink: null, message: null };
  }

  private async releaseBookingLock(
    lockKey: string,
    sessionId: string,
    latencyMs: number
  ): Promise<void> {
    try {
      // Compare-and-delete: the 60-second lock could expire and be acquired by
      // a newer request while this one is still finishing.
      await redisClient.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        lockKey,
        sessionId
      );
    } catch {
      // The TTL remains the final cleanup guard. A Redis cleanup failure must
      // never turn a completed remote reservation into a client-visible error.
      logDineoutCall({
        sessionId,
        tool: "book_table",
        status: "lock_cleanup_failed",
        latencyMs,
        outcome: "lock_ttl_retained",
      });
    }
  }

  private async retainBookingLock(
    lockKey: string,
    sessionId: string,
    latencyMs: number
  ): Promise<void> {
    try {
      // An ambiguous non-idempotent write is materially riskier than making
      // the customer wait. Keep this exact owner's guard for 15 minutes so a
      // refresh/double-submit cannot immediately create a second reservation.
      await redisClient.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('expire', KEYS[1], ARGV[2]) else return 0 end",
        1,
        lockKey,
        sessionId,
        15 * 60
      );
    } catch {
      logDineoutCall({
        sessionId,
        tool: "book_table",
        status: "lock_retention_failed",
        latencyMs,
        outcome: "initial_lock_ttl_retained",
      });
    }
  }

  private async reconcilePossibleDuplicate(
    customerId: string,
    input: {
      reservationTime: number;
      guestCount: number;
      restaurantName?: string;
    },
    responseOrderId?: string
  ): Promise<{
    needsSwiggyAuth: boolean;
    error: string | null;
    confirming: boolean;
    booking: MappedBookingConfirmation | null;
  }> {
    let orderId = responseOrderId;
    if (!orderId && input.restaurantName) {
      try {
        const known = await DineoutBookingModel.findOne({
          customerId,
          restaurantName: input.restaurantName,
          reservationTime: new Date(input.reservationTime * 1000),
          guestCount: input.guestCount,
        })
          .sort({ createdAt: -1 })
          .lean();
        orderId = known?.swiggyOrderId;
      } catch {
        // A duplicate response means the remote outcome may already be final.
        // If our ledger cannot supply a real order id, preserve ambiguity; do
        // not throw and do not manufacture an id for get_booking_status.
      }
    }

    // get_booking_status requires a real orderId. If neither Swiggy nor our
    // successful-booking ledger has one, stay ambiguous and never fabricate it.
    if (!orderId) {
      return {
        needsSwiggyAuth: false,
        error: null,
        confirming: true,
        booking: null,
      };
    }

    const status = await this.getBookingStatus(customerId, orderId);
    if (status.needsSwiggyAuth) {
      return {
        needsSwiggyAuth: true,
        error: null,
        confirming: false,
        booking: null,
      };
    }
    if (status.data) {
      const booking = status.data;
      // Duplicate reconciliation may be the first point at which Hoizr learns
      // the successful remote order id. Repair the local ledger so My
      // Reservations and reminders do not lose a real Swiggy booking.
      await DineoutBookingModel.updateOne(
        { customerId, swiggyOrderId: booking.orderId },
        {
          $set: {
            restaurantName:
              input.restaurantName ?? booking.restaurantName ?? "Reservation",
            restaurantAddress: booking.restaurantAddress,
            reservationTime: new Date(
              (booking.reservationTime ?? input.reservationTime) * 1000
            ),
            guestCount: booking.guestCount ?? input.guestCount,
            status: booking.status ?? "CONFIRMED",
          },
          $setOnInsert: {
            customerId,
            swiggyOrderId: booking.orderId,
          },
        },
        { upsert: true }
      ).catch((): undefined => undefined);
      return {
        needsSwiggyAuth: false,
        error: null,
        confirming: false,
        booking,
      };
    }
    return {
      needsSwiggyAuth: false,
      error: null,
      confirming: true,
      booking: null,
    };
  }
}
