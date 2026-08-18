import { MappedSlot, MappedDeal } from "./deals";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE RESPONSE SEAM — shapes VERIFIED against the LIVE API (2026-07-18):
 *  - search_restaurants_dineout: TEXT ONLY (structuredContent is {}). Lines:
 *      "N. <name> — <cost> | <rating>★ | <cuisines> | <locality> (ID: <id>)"
 *    (rating is often the upstream bug string "[object Object]").
 *  - get_restaurant_details: structuredContent {restaurantId, restaurant:
 *      {id, name, cuisines[], locality, address, avgRating, costForTwo,
 *       imageUrl, mastheadImageUrls[], …}}.
 *  - get_available_slots: _meta.slots[] = {displayTime, slotGroupName,
 *      dateStr, reservationTime:"<epoch string>", deals:[{itemId, slotId,
 *      isFree, title, bookingPrice}]}  ← slotId lives on the DEAL.
 *  - get_saved_locations: structuredContent {data:{locations:[{index, id,
 *      addressLine, phoneNumber, addressCategory, addressTag}]}}.
 *  - book_table / get_booking_status: not yet exercised live — object path
 *    reads tolerant variants; a text fallback greps the order/booking id.
 * ─────────────────────────────────────────────────────────────────────────
 */

const num = (v: unknown): number | undefined =>
  typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)) ? Number(v) : undefined;
const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : v === undefined || v === null ? undefined : String(v);
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

/** Pull the first present key from an object. */
const pick = (o: any, ...keys: string[]): unknown => {
  if (!o || typeof o !== "object") return undefined;
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};

export type MappedRestaurant = {
  restaurantId: string;
  name?: string;
  cuisines: string[];
  rating?: number;
  ratingCount?: number;
  costForTwo?: string;
  distance?: string;
  address?: string;
  highlights: string[];
  offers: string[];
  availability?: string;
  source?: string;
  imageUrl?: string;
  mastheadImages: string[]; // live details: mastheadImageUrls[]
};

export type MappedSavedLocation = {
  id: string;
  addressLine?: string;
  lat?: number;
  lng?: number;
};

export type MappedBookingConfirmation = {
  orderId: string;
  restaurantName?: string;
  restaurantAddress?: string;
  reservationTime?: number; // epoch seconds
  guestCount?: number;
  dealTitle?: string;
  status?: string;
};

const toStringArray = (v: unknown): string[] =>
  arr(v)
    .map((x) => (typeof x === "string" ? x : str(pick(x, "name", "title", "text"))))
    .filter((x): x is string => !!x);

export const mapRestaurant = (raw: any): MappedRestaurant | null => {
  const restaurantId = str(pick(raw, "restaurantId", "id", "restaurant_id"));
  if (!restaurantId) return null;
  return {
    restaurantId,
    name: str(pick(raw, "name", "restaurantName", "title"))?.trim(), // live data has trailing \t
    cuisines: toStringArray(pick(raw, "cuisines", "cuisine")),
    rating: num(pick(raw, "rating", "avgRating", "ratingValue")),
    ratingCount: num(pick(raw, "ratingCount", "ratingCountValue", "totalRatings")),
    costForTwo: str(pick(raw, "costForTwo", "cost_for_two", "costForTwoMessage")),
    distance: str(pick(raw, "distance", "distanceInfo")),
    address: str(pick(raw, "address", "fullAddress", "locality")),
    highlights: toStringArray(pick(raw, "highlights", "amenities", "facilities")),
    offers: toStringArray(pick(raw, "offers", "bankOffers", "deals")),
    availability: str(pick(raw, "availability", "availabilityStatus")),
    source: str(pick(raw, "source")),
    imageUrl: str(pick(raw, "imageUrl", "image", "imageId")),
    mastheadImages: toStringArray(pick(raw, "mastheadImageUrls", "mastheadImages", "images")),
  };
};

/**
 * search_restaurants_dineout → restaurant list. LIVE shape is agent TEXT:
 *   "1. Koramangala SOCIAL —  | [object Object]★ |  | Koramangala (ID: 834264)"
 * Object/array payloads are still handled in case Swiggy ships structured
 * search later.
 */
const SEARCH_LINE = /^\s*\d+\.\s*(.+?)\s*\(ID:\s*([A-Za-z0-9_-]+)\)\s*$/;

export const parseSearchText = (text: string): MappedRestaurant[] => {
  const out: MappedRestaurant[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = SEARCH_LINE.exec(line);
    if (!m) continue;
    const [, head, restaurantId] = m;
    // head = "<name> — <cuisines> | <rating>★ | <cost> | <locality>"
    // (segment order LIVE-verified 2026-07-18 via populated category-search
    // lines, e.g. "Quarter Peter — Bar Food, Continental | 3.9★ | ₹1,400 | …")
    const dash = head.split("—");
    const name = dash[0]?.trim();
    const segs = (dash.slice(1).join("—") ?? "").split("|").map((x) => x.trim());
    const locality = segs.length > 0 ? segs[segs.length - 1] : undefined;
    const ratingSeg = segs.find((x) => x.endsWith("★"))?.replace(/★$/, "").trim();
    const rating =
      ratingSeg && /^\d+(\.\d+)?$/.test(ratingSeg) ? Number(ratingSeg) : undefined;
    const cuisineSeg = segs.length >= 4 ? segs[0] : undefined;
    const cuisines =
      cuisineSeg && cuisineSeg !== "" && !cuisineSeg.includes("[object")
        ? cuisineSeg.split(",").map((c) => c.trim()).filter(Boolean)
        : [];
    const costSeg = segs.length >= 4 ? segs[2] : undefined;
    out.push({
      restaurantId,
      name,
      cuisines,
      rating,
      ratingCount: undefined,
      costForTwo: costSeg && costSeg !== "" ? costSeg : undefined,
      distance: undefined,
      address: locality && locality !== "" ? locality : undefined,
      highlights: [],
      offers: [],
      availability: undefined,
      source: undefined,
      imageUrl: undefined,
      mastheadImages: [],
    });
  }
  return out;
};

export const mapRestaurantList = (data: any): MappedRestaurant[] => {
  if (typeof data === "string") return parseSearchText(data);
  const list = Array.isArray(data)
    ? data
    : arr(pick(data, "restaurants", "results", "list", "items"));
  return list.map(mapRestaurant).filter((r): r is MappedRestaurant => r !== null);
};

/** get_restaurant_details → single restaurant. data may be the object or {restaurant:{...}}. */
export const mapRestaurantDetails = (data: any): MappedRestaurant | null =>
  mapRestaurant(pick(data, "restaurant") ?? data);

const mapDeal = (raw: any): MappedDeal => ({
  title: str(pick(raw, "title", "dealTitle", "name")),
  itemId: str(pick(raw, "itemId", "item_id", "ticketId")),
  slotId: num(pick(raw, "slotId", "slot_id")),
  bookingPrice: num(pick(raw, "bookingPrice", "price", "amount")),
  displayFee: str(pick(raw, "displayFee", "feeText")),
  discountPercentage: num(pick(raw, "discountPercentage", "discountPct", "discount")),
  isFree: pick(raw, "isFree", "free") === true,
});

const mapSlot = (raw: any): MappedSlot | null => {
  const deals = arr(pick(raw, "deals", "offers")).map(mapDeal);
  // LIVE shape: slotId lives on each deal, not the slot — fall back to it.
  const slotId = num(pick(raw, "slotId", "id")) ?? deals[0]?.slotId;
  if (slotId === undefined) return null;
  return {
    slotId,
    reservationTime: num(pick(raw, "reservationTime", "epoch", "timestamp")),
    itemId: str(pick(raw, "itemId", "item_id")),
    displayTime: str(pick(raw, "displayTime", "time", "label")),
    slotGroupName: str(pick(raw, "slotGroupName", "group", "band", "mealType")),
    dateStr: str(pick(raw, "dateStr", "date")),
    deals,
  };
};

/** get_available_slots → slots. Recipe reveals data.slots[]. */
export const mapSlots = (data: any): MappedSlot[] => {
  const list = Array.isArray(data)
    ? data
    : arr(pick(data, "slots", "availableSlots", "results"));
  return list.map(mapSlot).filter((s): s is MappedSlot => s !== null);
};

/** get_saved_locations → id + addressLine (docs say no lat/lng; recipe hints lat/lng — read both). */
export const mapSavedLocations = (data: any): MappedSavedLocation[] => {
  const list = Array.isArray(data)
    ? data
    : arr(pick(data, "locations", "addresses", "savedLocations", "results"));
  return list
    .map((raw): MappedSavedLocation | null => {
      const id = str(pick(raw, "id", "addressId"));
      if (!id) return null;
      return {
        id,
        addressLine: str(pick(raw, "addressLine", "address", "formattedAddress")),
        lat: num(pick(raw, "lat", "latitude")),
        lng: num(pick(raw, "lng", "longitude")),
      };
    })
    .filter((x): x is MappedSavedLocation => x !== null);
};

/**
 * book_table + get_booking_status → confirmation. Reference says book_table
 * returns an "order ID"; the recipe reads data.bookingId — read both (this is
 * the 3-way orderId/bookingId ambiguity, resolved in dev).
 */
export const mapBookingConfirmation = (data: any): MappedBookingConfirmation | null => {
  if (typeof data === "string") {
    // Agent-text fallback: grep the order/booking id out of the prose.
    const m = /(?:order|booking)\s*id\s*[:#]?\s*"?([A-Za-z0-9_-]{4,})"?/i.exec(data);
    return m ? { orderId: m[1] } : null;
  }
  const orderId = str(pick(data, "orderId", "bookingId", "order_id", "id"));
  if (!orderId) return null;
  return {
    orderId,
    restaurantName: str(pick(data, "restaurantName", "restaurant", "name")),
    restaurantAddress: str(pick(data, "restaurantAddress", "address")),
    reservationTime: num(pick(data, "reservationTime", "epoch", "timestamp")),
    guestCount: num(pick(data, "guestCount", "guests", "partySize")),
    dealTitle: str(pick(data, "dealTitle", "deal", "title")),
    status: str(pick(data, "status", "bookingStatus", "state")),
  };
};
