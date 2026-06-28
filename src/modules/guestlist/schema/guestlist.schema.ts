import { Guestlist, GuestlistEntry } from "@hoizr-technology/shared";
import { getModelForClass } from "@typegoose/typegoose";

/**
 * Customer-server views of the guestlist collections (config + entries).
 * Same collections main-server writes to — customer-server handles join,
 * the golden ticket, and scan check-in.
 */
export const GuestlistModel = getModelForClass(Guestlist, {
  schemaOptions: { timestamps: true, collection: "guestlists" },
});

export const GuestlistEntryModel = getModelForClass(GuestlistEntry, {
  schemaOptions: { timestamps: true, collection: "guestlist_entries" },
});

export { Guestlist, GuestlistEntry };
