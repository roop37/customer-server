import { Field, InputType, Int } from "type-graphql";

@InputType()
export class PublicEventFilterInput {
  @Field(() => String, { nullable: true })
  city?: string;

  @Field(() => String, { nullable: true })
  cityId?: string;

  @Field(() => [String], { nullable: true })
  eventCategoryIds?: string[];

  @Field(() => [String], { nullable: true })
  genreTagIds?: string[];

  @Field(() => Date, { nullable: true })
  startDateFrom?: Date;

  @Field(() => Date, { nullable: true })
  startDateTo?: Date;

  @Field(() => Number, { nullable: true })
  minPrice?: number;

  @Field(() => Number, { nullable: true })
  maxPrice?: number;

  @Field(() => String, { nullable: true })
  search?: string;

  @Field(() => Int, { nullable: true, defaultValue: 1 })
  page?: number;

  @Field(() => Int, { nullable: true, defaultValue: 20 })
  pageSize?: number;
}
