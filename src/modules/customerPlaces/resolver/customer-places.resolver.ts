import { Arg, Ctx, Query, Resolver, UseMiddleware } from "type-graphql";
import { isCustomerAuthenticated } from "../../../middlewares/customer-auth";
import Context from "../../../types/context.type";
import {
  CustomerPlaceDetail,
  CustomerPlacePrediction,
} from "../interfaces/customer-places.types";
import { CustomerPlacesService } from "../service/customer-places.service";

@Resolver()
export class CustomerPlacesResolver {
  private readonly service = new CustomerPlacesService();

  @Query(() => [CustomerPlacePrediction])
  @UseMiddleware(isCustomerAuthenticated)
  async customerPlacesAutocomplete(
    @Ctx() ctx: Context,
    @Arg("input") input: string
  ): Promise<CustomerPlacePrediction[]> {
    return this.service.autocomplete(ctx.customerId as string, input);
  }

  @Query(() => CustomerPlaceDetail, { nullable: true })
  @UseMiddleware(isCustomerAuthenticated)
  async customerPlaceDetails(
    @Ctx() ctx: Context,
    @Arg("placeId") placeId: string
  ): Promise<CustomerPlaceDetail | null> {
    return this.service.details(ctx.customerId as string, placeId);
  }
}
