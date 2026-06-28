import axios from "axios";
import { ErrorWithProps } from "mercurius";
import { EnvVars } from "../../../utils/environment";
import { redisClient } from "../../../utils/redis";
import {
  CustomerPlaceDetail,
  CustomerPlacePrediction,
} from "../interfaces/customer-places.types";

/**
 * Customer-facing place autocomplete + detail lookup. Wraps Google
 * Places (the same upstream main-server hits for host venue search)
 * with two layers of protection:
 *
 *   1. Auth — every resolver requires `isCustomerAuthenticated`, so
 *      anonymous callers can't burn the API quota.
 *   2. Per-customer rate limit — Redis-backed sliding window.
 *      Autocomplete fires per keystroke; the limits below are tuned
 *      for "active typing" not "constant abuse":
 *        - autocomplete: 60 calls / 60s
 *        - details:      20 calls / 60s  (one per chosen suggestion)
 *      Once the cap is hit the resolver throws a graphql-shaped
 *      error so the client can render a "slow down" toast without
 *      surfacing the raw Redis state.
 *
 * The Google key (`MAPS_API_KEY`) is server-side only — never sent
 * to the browser. Limiting to `IN` keeps suggestions India-local.
 */

const PLACES_AUTOCOMPLETE_API =
  "https://places.googleapis.com/v1/places:autocomplete";
const PLACE_DETAIL_API = "https://places.googleapis.com/v1/places";
const REVERSE_GEOCODING_API =
  "https://maps.googleapis.com/maps/api/geocode/json";

const RL_WINDOW_SECONDS = 60;
const RL_AUTOCOMPLETE_MAX = 60;
const RL_DETAILS_MAX = 20;
const RL_KEY_PREFIX = "rl:cust-places";

const enforceRateLimit = async (
  customerId: string,
  bucket: "autocomplete" | "details",
  max: number
): Promise<void> => {
  const key = `${RL_KEY_PREFIX}:${bucket}:${customerId}`;
  const n = await redisClient.incr(key);
  if (n === 1) {
    await redisClient.expire(key, RL_WINDOW_SECONDS);
  }
  if (n > max) {
    throw new ErrorWithProps(
      "You're searching addresses very quickly. Try again in a minute.",
      { code: "PLACES_RATE_LIMITED" }
    );
  }
};

const requireMapsApiKey = (): string => {
  const key = EnvVars.values.MAPS_API_KEY;
  if (!key) {
    throw new ErrorWithProps(
      "Address search isn't configured on this server.",
      { code: "PLACES_NOT_CONFIGURED" }
    );
  }
  return key;
};

const findAddressComponent = (
  components: Array<{ long_name?: string; types?: string[] }>,
  type: string
): string | undefined => {
  for (const c of components ?? []) {
    if (c.types?.includes(type)) return c.long_name;
  }
  return undefined;
};

export class CustomerPlacesService {
  async autocomplete(
    customerId: string,
    input: string
  ): Promise<CustomerPlacePrediction[]> {
    const query = input?.trim();
    // Empty / 1-char queries are dropped without hitting Google or
    // counting against the rate limit. Google charges per request, no
    // point billing on a near-empty input that won't surface meaningful
    // results anyway.
    if (!query || query.length < 2) return [];

    await enforceRateLimit(customerId, "autocomplete", RL_AUTOCOMPLETE_MAX);
    const apiKey = requireMapsApiKey();

    const response = await axios.post(
      PLACES_AUTOCOMPLETE_API,
      { input: query, includedRegionCodes: ["in"] },
      { headers: { "X-Goog-Api-Key": apiKey } }
    );

    if (response.status !== 200) return [];
    const suggestions = response.data?.suggestions;
    if (!Array.isArray(suggestions)) return [];

    const results: CustomerPlacePrediction[] = [];
    for (const s of suggestions) {
      const p = s?.placePrediction;
      if (p?.placeId && p?.text?.text) {
        results.push({ placeId: p.placeId, displayName: p.text.text });
      }
    }
    return results;
  }

  async details(
    customerId: string,
    placeId: string
  ): Promise<CustomerPlaceDetail | null> {
    if (!placeId?.trim()) return null;
    await enforceRateLimit(customerId, "details", RL_DETAILS_MAX);
    const apiKey = requireMapsApiKey();

    const lookup = await axios.get(`${PLACE_DETAIL_API}/${placeId}`, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "id,displayName,location,formattedAddress",
      },
    });
    if (lookup.status !== 200) return null;
    const loc = lookup.data?.location;
    if (!loc || typeof loc.latitude !== "number" || typeof loc.longitude !== "number") {
      return null;
    }

    // Reverse geocode for the structured address components Google's
    // Place lookup doesn't return on its own. If this fails we still
    // hand back lat/lng + the place's formattedAddress so the form
    // can pre-fill at least the line + coords.
    let city: string | undefined;
    let state: string | undefined;
    let pincode: string | undefined;
    let addressLine1: string | undefined;
    let addressLine2: string | undefined;
    let formattedAddress: string | undefined =
      lookup.data?.formattedAddress ?? lookup.data?.displayName?.text;

    try {
      const reverse = await axios.get(REVERSE_GEOCODING_API, {
        params: {
          latlng: `${loc.latitude},${loc.longitude}`,
          key: apiKey,
        },
      });
      const first = reverse.data?.results?.[0];
      if (first) {
        const components = first.address_components ?? [];
        city = findAddressComponent(components, "locality");
        state = findAddressComponent(components, "administrative_area_level_1");
        pincode = findAddressComponent(components, "postal_code");
        const streetNumber = findAddressComponent(components, "street_number");
        const route = findAddressComponent(components, "route");
        addressLine1 =
          [streetNumber, route].filter(Boolean).join(" ").trim() || undefined;
        addressLine2 =
          findAddressComponent(components, "sublocality") ??
          findAddressComponent(components, "sublocality_level_1") ??
          findAddressComponent(components, "neighborhood");
        formattedAddress = first.formatted_address ?? formattedAddress;
      }
    } catch {
      // Best-effort enrichment — silent fallback to lat/lng only.
    }

    return {
      latitude: loc.latitude,
      longitude: loc.longitude,
      addressLine1,
      addressLine2,
      city,
      state,
      pincode,
      formattedAddress,
    };
  }
}
