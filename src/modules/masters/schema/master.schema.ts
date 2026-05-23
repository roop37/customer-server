import { EventCategory, GenreTag, IndianCity } from "@hoizr-technology/shared";
import { getModelForClass } from "@typegoose/typegoose";

const EventCategoryModel = getModelForClass(EventCategory, {
  schemaOptions: { timestamps: true, collection: "eventcategories" },
});

const GenreTagModel = getModelForClass(GenreTag, {
  schemaOptions: { timestamps: true, collection: "genretags" },
});

const IndianCityModel = getModelForClass(IndianCity, {
  schemaOptions: { timestamps: true, collection: "indiancities" },
});

export {
  EventCategory,
  EventCategoryModel,
  GenreTag,
  GenreTagModel,
  IndianCity,
  IndianCityModel,
};
