import { ArtistMerchOrder } from "@hoizr-technology/shared";
import { Arg, Ctx, Mutation, Query, Resolver, UseMiddleware } from "type-graphql";
import { isCustomerAuthenticated } from "../../../middlewares/customer-auth";
import Context from "../../../types/context.type";
import {
  ConfirmArtistMerchPaymentInput,
  CreateArtistMerchOrderInput,
} from "../interfaces/artist-merch-order.input";
import { CreateArtistMerchOrderResult } from "../interfaces/artist-merch-order.objects";
import ArtistMerchOrderService from "../service/artist-merch-order.service";

@Resolver()
export class ArtistMerchOrderResolver {
  private readonly service = new ArtistMerchOrderService();

  @Mutation(() => CreateArtistMerchOrderResult)
  @UseMiddleware(isCustomerAuthenticated)
  async createArtistMerchOrder(
    @Arg("input") input: CreateArtistMerchOrderInput,
    @Ctx() ctx: Context
  ): Promise<CreateArtistMerchOrderResult> {
    return this.service.createOrder(input, ctx);
  }

  @Mutation(() => ArtistMerchOrder)
  @UseMiddleware(isCustomerAuthenticated)
  async confirmArtistMerchPayment(
    @Arg("input") input: ConfirmArtistMerchPaymentInput,
    @Ctx() ctx: Context
  ): Promise<ArtistMerchOrder> {
    return this.service.confirmPayment(input, ctx);
  }

  @Query(() => [ArtistMerchOrder])
  @UseMiddleware(isCustomerAuthenticated)
  async myArtistMerchOrders(
    @Ctx() ctx: Context
  ): Promise<ArtistMerchOrder[]> {
    return this.service.listMyMerchOrders(ctx);
  }
}
