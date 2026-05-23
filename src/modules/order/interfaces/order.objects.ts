import { Field, ObjectType } from "type-graphql";
import { CustomerOrderView } from "./order.view";

@ObjectType()
export class RazorpayCheckoutPayload {
  @Field(() => String)
  razorpayOrderId: string;

  @Field(() => String)
  razorpayKeyId: string;

  @Field(() => Number)
  amount: number;

  @Field(() => String)
  currency: string;

  @Field(() => String)
  orderId: string;
}

@ObjectType()
export class CreateOrderResponse {
  @Field(() => CustomerOrderView)
  order: CustomerOrderView;

  @Field(() => RazorpayCheckoutPayload, { nullable: true })
  checkout?: RazorpayCheckoutPayload;
}
