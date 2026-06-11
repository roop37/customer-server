import { OfflineOrder } from "@hoizr-technology/shared";
import { getModelForClass } from "@typegoose/typegoose";

/** Same `offline_orders` collection main-server writes to. */
export const OfflineOrderModel = getModelForClass(OfflineOrder, {
  schemaOptions: { timestamps: true, collection: "offline_orders" },
});
