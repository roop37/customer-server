import assert from "assert/strict";
import {
  mapRestaurantList,
  mapRestaurantDetails,
  mapSlots,
  mapSavedLocations,
  mapBookingConfirmation,
} from "../modules/dineout/util/response-mapper";

// Restaurant list — LIVE shape: agent text lines (real sample from the API).
(() => {
  const text = [
    "Found 39 dineout restaurant(s):",
    "1. Koramangala SOCIAL —  | [object Object]★ |  | Koramangala (ID: 834264)",
    "2. The Beer Social —  | [object Object]★ |  | Binnipete (ID: 1224859)",
    "Search coordinates: latitude=12.9716, longitude=77.5946 (use these...)",
  ].join("\n");
  const rs = mapRestaurantList(text);
  assert.equal(rs.length, 2, "two restaurant lines parsed");
  assert.equal(rs[0].restaurantId, "834264");
  assert.equal(rs[0].name, "Koramangala SOCIAL");
  assert.equal(rs[0].address, "Koramangala", "locality → address");
  assert.equal(rs[0].rating, undefined, "[object Object]★ not parsed as rating");
  assert.equal(rs[1].restaurantId, "1224859");
})();

// Populated line (category search) — segment order: cuisines | rating★ | cost | locality.
(() => {
  const rs = mapRestaurantList(
    "1. Quarter Peter — Bar Food, Continental | 3.9★ | ₹1,400 | Koramangala (ID: 555111)"
  );
  assert.equal(rs[0].restaurantId, "555111");
  assert.equal(rs[0].name, "Quarter Peter");
  assert.deepEqual(rs[0].cuisines, ["Bar Food", "Continental"], "seg[0] = cuisines");
  assert.equal(rs[0].rating, 3.9, "★ segment parsed");
  assert.equal(rs[0].costForTwo, "₹1,400", "seg[2] = cost");
  assert.equal(rs[0].address, "Koramangala");
})();

// Restaurant list — object forms still handled (future structured search).
(() => {
  const fromArray = mapRestaurantList([
    { id: "r1", name: "Social", cuisines: ["Continental"], rating: 4.3, ratingCount: 1200, costForTwo: "₹1500" },
    { name: "no-id-dropped" },
  ]);
  assert.equal(fromArray.length, 1);
  assert.equal(fromArray[0].restaurantId, "r1");
  const fromWrapped = mapRestaurantList({ restaurants: [{ restaurantId: "r2" }] });
  assert.equal(fromWrapped[0].restaurantId, "r2");
})();

// Details — LIVE shape: structuredContent {restaurantId, restaurant:{...}}.
(() => {
  const live = mapRestaurantDetails({
    restaurantId: "834264",
    restaurant: {
      id: "834264", restaurantId: "834264", name: "Koramangala SOCIAL\t",
      cuisines: ["Bar Food", "Mexican"], locality: "Koramangala, Bangalore",
      address: "5.4 km • 3Rd Floor, 80 Feet Road", avgRating: 4.2,
      costForTwo: "₹1500 for two",
    },
  });
  assert.equal(live?.restaurantId, "834264");
  assert.equal(live?.rating, 4.2, "avgRating read");
  assert.equal(live?.costForTwo, "₹1500 for two");
  assert.equal(live?.cuisines.length, 2);
  assert.equal(mapRestaurantDetails({ nope: 1 }), null);
})();

// Slots — LIVE shape (_meta.slots): slotId on the DEAL, epoch as string.
(() => {
  const slots = mapSlots({
    slots: [
      {
        displayTime: "11:00 PM", slotGroupName: "Dinner", dateStr: "2026-07-18",
        reservationTime: "1784395800",
        deals: [{ itemId: "834264-82246", slotId: 1, isFree: true, title: "Standard table booking", bookingPrice: 0 }],
      },
      { displayTime: "no slotId anywhere dropped", deals: [{}] },
    ],
  });
  assert.equal(slots.length, 1);
  assert.equal(slots[0].slotId, 1, "slotId lifted from the deal");
  assert.equal(slots[0].reservationTime, 1784395800, "string epoch → number");
  assert.equal(slots[0].dateStr, "2026-07-18");
  assert.equal(slots[0].deals[0].slotId, 1);
  assert.equal(slots[0].deals[0].isFree, true);
})();

// Saved locations — LIVE shape: {data:{locations:[{index,id,addressLine,...}]}}
// (service unwraps the outer .data before mapping; test the inner shape).
(() => {
  const locs = mapSavedLocations({
    locations: [
      { index: 1, id: "d6466in0", addressLine: "Thane West, Thane", phoneNumber: "****3928", addressCategory: "Other", addressTag: "Home New" },
      { addressLine: "no-id-dropped" },
    ],
  });
  assert.equal(locs.length, 1);
  assert.equal(locs[0].id, "d6466in0");
  assert.equal(locs[0].addressLine, "Thane West, Thane");
})();

// Booking confirmation: object variants + agent-text fallback.
(() => {
  assert.equal(mapBookingConfirmation({ orderId: "ORD1", status: "CONFIRMED" })?.orderId, "ORD1");
  assert.equal(mapBookingConfirmation({ bookingId: "BK2" })?.orderId, "BK2");
  assert.equal(mapBookingConfirmation({ nothing: true }), null);
  assert.equal(
    mapBookingConfirmation('Booking confirmed! Order ID: ABC123XYZ. Show this at the door.')?.orderId,
    "ABC123XYZ",
    "text fallback greps the order id"
  );
})();

console.log("swiggy-response-mapper.test.ts passed");
