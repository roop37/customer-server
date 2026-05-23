import { Order } from "@hoizr-technology/shared";
import { getModelForClass } from "@typegoose/typegoose";

const OrderModel = getModelForClass(Order, {
  schemaOptions: { timestamps: true, collection: "orders" },
});

export { Order, OrderModel };
