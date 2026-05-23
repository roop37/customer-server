import { Query, Resolver } from "type-graphql";
import {
  EventCategory,
  EventCategoryModel,
  GenreTag,
  GenreTagModel,
  IndianCity,
  IndianCityModel,
} from "../schema/master.schema";

@Resolver()
export class MastersResolver {
  @Query(() => [IndianCity])
  async getActiveIndianCities(): Promise<IndianCity[]> {
    return IndianCityModel.find({ status: true })
      .sort({ rank: 1, value: 1 })
      .lean<IndianCity[]>();
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
