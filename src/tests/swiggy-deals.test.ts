import assert from "assert/strict";
import {
  isBookableDeal,
  filterToFreeSlots,
  groupSlotsByBand,
  MappedSlot,
} from "../modules/dineout/util/deals";

// isBookableDeal: free AND zero price.
(() => {
  assert.equal(isBookableDeal({ isFree: true, bookingPrice: 0 }), true);
  assert.equal(isBookableDeal({ isFree: true }), true); // price undefined => 0
  assert.equal(isBookableDeal({ isFree: true, bookingPrice: 50 }), false);
  assert.equal(isBookableDeal({ isFree: false, bookingPrice: 0 }), false);
})();

// filterToFreeSlots: drop slots with no free deal; RETAIN paid deals on kept
// slots (Swiggy guidance: surface both), sorted free-first.
(() => {
  const slots: MappedSlot[] = [
    {
      slotId: 1,
      slotGroupName: "Dinner",
      deals: [
        { isFree: false, bookingPrice: 25, title: "Flat 20% off", slotId: 1 },
        { isFree: true, bookingPrice: 0, title: "Free table", slotId: 1 },
      ],
    },
    {
      slotId: 2,
      slotGroupName: "Dinner",
      deals: [{ isFree: false, bookingPrice: 100, title: "Paid only" }],
    },
    { slotId: 3, slotGroupName: "Lunch", deals: [] },
  ];
  const out = filterToFreeSlots(slots);
  assert.equal(out.length, 1, "only the slot with a free deal survives");
  assert.equal(out[0].slotId, 1);
  assert.equal(out[0].deals.length, 2, "paid deal RETAINED for display");
  assert.equal(out[0].deals[0].title, "Free table", "free deal sorted first");
  assert.equal(out[0].deals[1].isFree, false);
})();

// groupSlotsByBand: canonical order, empty groups omitted, order preserved.
(() => {
  const slots: MappedSlot[] = [
    { slotId: 10, slotGroupName: "Dinner", deals: [] },
    { slotId: 11, slotGroupName: "Breakfast", deals: [] },
    { slotId: 12, slotGroupName: "Dinner", deals: [] },
    { slotId: 13, slotGroupName: "Lunch", deals: [] },
    { slotId: 14, slotGroupName: "Brunch", deals: [] }, // unknown band → after
  ];
  const groups = groupSlotsByBand(slots);
  assert.deepEqual(
    groups.map((g) => g.name),
    ["Breakfast", "Lunch", "Dinner", "Brunch"],
    "canonical bands first, unknown after"
  );
  const dinner = groups.find((g) => g.name === "Dinner")!;
  assert.deepEqual(
    dinner.slots.map((s) => s.slotId),
    [10, 12],
    "slot order preserved within band"
  );
})();

// Missing slotGroupName => "Other".
(() => {
  const groups = groupSlotsByBand([{ slotId: 1, deals: [] }]);
  assert.equal(groups[0].name, "Other");
})();

console.log("swiggy-deals.test.ts passed");
