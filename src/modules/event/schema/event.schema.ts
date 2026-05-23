import { Event } from "@hoizr-technology/shared";
import { getModelForClass } from "@typegoose/typegoose";

const EventModel = getModelForClass(Event, {
  schemaOptions: { timestamps: true, collection: "events" },
});

export { Event, EventModel };
