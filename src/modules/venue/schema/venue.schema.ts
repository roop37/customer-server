import { Host } from "@hoizr-technology/shared";
import { getModelForClass } from "@typegoose/typegoose";

// Public venue listing reads the same `hosts` collection main-server owns.
// The Host Typegoose class lives in hoizr-shared; we only ever read it here.
const VenueHostModel = getModelForClass(Host, {
  schemaOptions: { timestamps: true },
});

export { Host, VenueHostModel };
