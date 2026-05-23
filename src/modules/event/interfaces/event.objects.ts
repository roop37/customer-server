import { Event } from "@hoizr-technology/shared";
import { Field, Int, ObjectType } from "type-graphql";

@ObjectType()
export class PublicEventPaginatedResponse {
  @Field(() => [Event])
  events: Event[];

  @Field(() => Int)
  total: number;

  @Field(() => Int)
  page: number;

  @Field(() => Int)
  pageSize: number;
}
