import assert from "assert/strict";
import { buildReservationEmailData } from "../modules/dineout/util/reservation-message";

// Confirmation content carries the transactional facts, IST-formatted time,
// and NO marketing fields.
(() => {
  const d = buildReservationEmailData({
    kind: "confirmed",
    restaurantName: "Koramangala SOCIAL",
    restaurantAddress: "80 Feet Road, Koramangala",
    reservationTime: new Date("2026-07-24T15:30:00.000Z"), // 9:00 PM IST
    guestCount: 4,
    orderId: "ORD1",
  });
  assert.equal(d.restaurantName, "Koramangala SOCIAL");
  assert.equal(d.guestCount, 4);
  assert.equal(d.orderId, "ORD1");
  assert.ok(String(d.whenLabel).includes("9:00"), "IST time in label");
  assert.equal(d.isReminder, false);
  // No marketing/upsell keys leak in.
  for (const banned of ["offer", "discount", "promo", "coupon"]) {
    assert.ok(!(banned in d), `no '${banned}' field`);
  }
})();

(() => {
  const d = buildReservationEmailData({
    kind: "reminder",
    restaurantName: "The Pump House",
    reservationTime: new Date("2026-07-24T15:30:00.000Z"),
    guestCount: 2,
    orderId: "ORD2",
  });
  assert.equal(d.isReminder, true);
  assert.equal(d.restaurantAddress, undefined);
})();

console.log("swiggy-reservation-notify.test.ts passed");
