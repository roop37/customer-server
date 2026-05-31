import { Event, Host, PhantomArtist } from "@hoizr-technology/shared";
import { getModelForClass } from "@typegoose/typegoose";

const EventModel = getModelForClass(Event, {
  schemaOptions: { timestamps: true, collection: "events" },
});

// People-of-event resolves lineup → Artist (already exposed via
// ArtistModel in the artistFollow module) and PhantomArtist + Host
// here so the customer event page can show artists, organizer, and
// collaborators in a single query.
export const HostModel = getModelForClass(Host, {
  schemaOptions: { timestamps: true },
});

export const PhantomArtistModel = getModelForClass(PhantomArtist, {
  schemaOptions: { timestamps: true },
});

export { Event, EventModel };
