import { getModelForClass } from "@typegoose/typegoose";
import { Artist, ArtistFollow } from "@hoizr-technology/shared";

export const ArtistModel = getModelForClass(Artist, {
  schemaOptions: { timestamps: true },
});

export const ArtistFollowModel = getModelForClass(ArtistFollow, {
  schemaOptions: { timestamps: true },
});

export { Artist, ArtistFollow };
