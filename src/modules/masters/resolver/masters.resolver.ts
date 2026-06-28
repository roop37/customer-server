import { Query, Resolver } from "type-graphql";
import {
  City,
  CityModel,
  EventCategory,
  EventCategoryModel,
  GenreTag,
  GenreTagModel,
  LanguageMaster,
  LanguageMasterModel,
  ProhibitedItemMaster,
  ProhibitedItemMasterModel,
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

  @Query(() => [LanguageMaster])
  async getActiveLanguages(): Promise<LanguageMaster[]> {
    return LanguageMasterModel.find({ status: true })
      .sort({ isIndian: -1, order: 1, value: 1 })
      .lean<LanguageMaster[]>();
  }

  @Query(() => [ProhibitedItemMaster])
  async getActiveProhibitedItems(): Promise<ProhibitedItemMaster[]> {
    return ProhibitedItemMasterModel.find({ status: true })
      .sort({ order: 1, value: 1 })
      .lean<ProhibitedItemMaster[]>();
  }
}
