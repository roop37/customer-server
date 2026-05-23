import { getModelForClass } from "@typegoose/typegoose";
import { ArtistMerchOrder } from "@hoizr-technology/shared";

export const ArtistMerchOrderModel = getModelForClass(ArtistMerchOrder, {
  schemaOptions: { timestamps: true },
});

export { ArtistMerchOrder };
