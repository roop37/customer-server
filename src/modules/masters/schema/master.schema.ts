import { EventCategory, GenreTag } from "@hoizr-technology/shared";
import {
  getModelForClass,
  ModelOptions,
  prop,
  Severity,
} from "@typegoose/typegoose";
import { Field, ID, ObjectType } from "type-graphql";

const EventCategoryModel = getModelForClass(EventCategory, {
  schemaOptions: { timestamps: true, collection: "eventcategories" },
});

const GenreTagModel = getModelForClass(GenreTag, {
  schemaOptions: { timestamps: true, collection: "genretags" },
});

@ObjectType("IndianCity")
@ModelOptions({ options: { allowMixed: Severity.ALLOW } })
class City {
  @Field(() => ID)
  _id: string;

  @Field(() => String)
  @prop({ required: true })
  value: string;

  @Field(() => String)
  @prop({ required: true, unique: true })
  cityId: string;

  @Field(() => String)
  @prop({ required: true })
  city: string;

  @Field(() => String, { nullable: true })
  @prop()
  district?: string;

  @Field(() => String, { nullable: true })
  @prop()
  state?: string;

  @Field(() => Number, { nullable: true })
  @prop()
  rank?: number;

  @Field(() => Number, { nullable: true })
  @prop()
  latitude?: number;

  @Field(() => Number, { nullable: true })
  @prop()
  longitude?: number;

  @Field(() => Boolean)
  @prop({ default: true })
  status: boolean;
}

const CityModel = getModelForClass(City, {
  schemaOptions: { timestamps: true, collection: "cities" },
});

export {
  City,
  CityModel,
  EventCategory,
  EventCategoryModel,
  GenreTag,
  GenreTagModel,
};
