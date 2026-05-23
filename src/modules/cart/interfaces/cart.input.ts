import { Field, InputType, Int } from "type-graphql";

@InputType()
export class CartTicketLineInput {
  @Field(() => String)
  ticketId: string;

  @Field(() => Int)
  quantity: number;
}

@InputType()
export class CartExtraLineInput {
  @Field(() => String)
  extraId: string;

  @Field(() => Int)
  quantity: number;
}

@InputType()
export class SetCartInput {
  @Field(() => String)
  eventId: string;

  @Field(() => [CartTicketLineInput])
  tickets: CartTicketLineInput[];

  @Field(() => [CartExtraLineInput], { nullable: true })
  extras?: CartExtraLineInput[];
}

@InputType()
export class GetCartInput {
  @Field(() => String)
  eventId: string;
}
