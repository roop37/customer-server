import { Query, Resolver } from "type-graphql";
import {
  City,
  CityModel,
  EventCategory,
  EventCategoryModel,
  GenreTag,
  GenreTagModel,
} from "../schema/master.schema";

@Resolver()
export class MastersResolver {
  @Query(() => [City])
  async getActiveIndianCities(): Promise<City[]> {
    return CityModel.find({ status: true })
      .sort({ rank: 1, value: 1 })
      .lean<City[]>();
  }

  @Query(() => [EventCategory])
  async getActiveEventCategories(): Promise<EventCategory[]> {
    return EventCategoryModel.find({ status: true })
      .sort({ value: 1 })
      .lean<EventCategory[]>();
  }

  @Query(() => [GenreTag])
  async getActiveGenreTags(): Promise<GenreTag[]> {
    return GenreTagModel.find({ status: true })
      .sort({ value: 1 })
      .lean<GenreTag[]>();
  }
}
