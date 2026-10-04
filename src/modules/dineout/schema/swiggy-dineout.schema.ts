import { getModelForClass } from "@typegoose/typegoose";
import {
  SwiggyDineoutConnection,
  DineoutBooking,
} from "@hoizr-technology/shared";

/**
 * Mongoose models for the two segregated Swiggy collections. Schema classes
 * are the source of truth in @hoizr-technology/shared; here we only bind them
 * to collections. `timestamps: true` manages createdAt/updatedAt.
 */
export const SwiggyDineoutConnectionModel = getModelForClass(
  SwiggyDineoutConnection,
  {
    schemaOptions: {
      collection: "swiggydineoutconnections",
      timestamps: true,
    },
  }
);

export const DineoutBookingModel = getModelForClass(DineoutBooking, {
  schemaOptions: { collection: "dineoutbookings", timestamps: true },
});
