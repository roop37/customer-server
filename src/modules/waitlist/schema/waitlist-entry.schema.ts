import { WaitlistEntry } from "@hoizr-technology/shared";
import { getModelForClass } from "@typegoose/typegoose";

/**
 * Waitlist entries collection. Class lives in hoizr-shared so main-server
 * (host review) and hoizr-workers (waitlist-open automation) share the shape.
 */
export const WaitlistEntryModel = getModelForClass(WaitlistEntry, {
  schemaOptions: { timestamps: true, collection: "waitlist_entries" },
});
