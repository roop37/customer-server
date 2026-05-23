import { ScannerUser } from "@hoizr-technology/shared";
import { getModelForClass } from "@typegoose/typegoose";

const ScannerUserModel = getModelForClass(ScannerUser, {
  schemaOptions: { timestamps: true, collection: "scannerusers" },
});

export { ScannerUser, ScannerUserModel };
