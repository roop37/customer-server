import { Customer } from "@hoizr-technology/shared";
import { getModelForClass } from "@typegoose/typegoose";

const CustomerModel = getModelForClass(Customer, {
  schemaOptions: { timestamps: true, collection: "customers" },
});

export { Customer, CustomerModel };
