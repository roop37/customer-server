/**
 * Pure logic for Dineout deals + slots. Kept separate from the MCP transport
 * and the field-name mapper so it is unit-testable and framework-free.
 *
 * COMPLIANCE (spec fact 5): only FREE deals are bookable
 * (isFree === true && bookingPrice === 0). Paid/prime deals are surfaced for
 * honesty but never get a book CTA — so we filter to free deals before the
 * client ever sees a bookable slot.
 */

export type MappedDeal = {
  title?: string;
  itemId?: string;
  slotId?: number; // LIVE API: slotId lives on the deal, not the slot
  bookingPrice?: number;
  displayFee?: string;
  discountPercentage?: number;
  isFree: boolean;
};

export type MappedSlot = {
  slotId: number;
  reservationTime?: number; // epoch seconds
  itemId?: string;
  displayTime?: string;
  slotGroupName?: string; // Breakfast | Lunch | Dinner
  dateStr?: string; // YYYY-MM-DD — the response spans up to 7 days
  deals: MappedDeal[];
};

export type SlotGroup = {
  name: string;
  slots: MappedSlot[];
};

/** A deal is bookable iff it is explicitly free at zero booking price. */
export const isBookableDeal = (deal: MappedDeal): boolean =>
  deal.isFree === true && (deal.bookingPrice ?? 0) === 0;

/**
 * Keep only slots that have at least one free/bookable deal (only free deals
 * are bookable via book_table). Paid deals on those slots are RETAINED for
 * display, sorted free-first — Swiggy's own payload instructs "surface BOTH…
 * never report a restaurant as free-only if any slot has an isFree=false
 * deal". The UI books the free deal and shows paid ones as-is.
 */
export const filterToFreeSlots = (slots: MappedSlot[]): MappedSlot[] =>
  slots
    .filter((s) => s.deals.some(isBookableDeal))
    .map((s) => ({
      ...s,
      deals: [...s.deals].sort(
        (a, b) => Number(isBookableDeal(b)) - Number(isBookableDeal(a))
      ),
    }));

// Canonical meal-band order; unknown groups sort after these, stable otherwise.
const BAND_ORDER = ["Breakfast", "Lunch", "Dinner"];

/**
 * Group slots by slotGroupName into Breakfast/Lunch/Dinner bands (canonical
 * order first, any other bands after in first-seen order). Empty groups are
 * omitted. Preserves slot order within a group.
 */
export const groupSlotsByBand = (slots: MappedSlot[]): SlotGroup[] => {
  const byName = new Map<string, MappedSlot[]>();
  for (const slot of slots) {
    const name = slot.slotGroupName || "Other";
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name)!.push(slot);
  }
  const rank = (name: string) => {
    const i = BAND_ORDER.indexOf(name);
    return i === -1 ? BAND_ORDER.length : i;
  };
  return [...byName.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([name, s]) => ({ name, slots: s }));
};
