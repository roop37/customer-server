import { Arg, Ctx, Mutation, Query, Resolver, UseMiddleware } from "type-graphql";
import { isCustomerAuthenticated } from "../../../middlewares/customer-auth";
import Context from "../../../types/context.type";
import {
  CreateOrderInput,
  MyOrdersFilterInput,
} from "../interfaces/order.input";
import {
  CreateOrderResponse,
  CustomerOrderInvoice,
} from "../interfaces/order.objects";
import { CustomerOrderView, toCustomerOrderView } from "../interfaces/order.view";
import OrderService from "../service/order.service";

@Resolver()
export class OrderResolver {
  private readonly service = new OrderService();

  @Mutation(() => CreateOrderResponse)
  @UseMiddleware(isCustomerAuthenticated)
  async createOrder(
    @Ctx() ctx: Context,
    @Arg("input") input: CreateOrderInput
  ): Promise<CreateOrderResponse> {
    const result = await this.service.createOrder(ctx.customerId as string, input);
    return {
      order: toCustomerOrderView(result.order),
      checkout: result.checkout,
    };
  }

  /**
   * AUDIT-030: lets the checkout client resume a PaymentPending order
   * the customer abandoned mid-Razorpay-popup, without minting a fresh
   * Razorpay order each time (which would risk a double-capture).
   */
  @Mutation(() => CreateOrderResponse)
  @UseMiddleware(isCustomerAuthenticated)
  async reusePendingOrder(
    @Ctx() ctx: Context,
    @Arg("orderId") orderId: string
  ): Promise<CreateOrderResponse> {
    const result = await this.service.reusePendingOrder(
      ctx.customerId as string,
      orderId
    );
    return {
      order: toCustomerOrderView(result.order),
      checkout: result.checkout,
    };
  }

  @Mutation(() => CustomerOrderView)
  @UseMiddleware(isCustomerAuthenticated)
  async confirmOrderPayment(
    @Ctx() ctx: Context,
    @Arg("razorpayOrderId") razorpayOrderId: string,
    @Arg("razorpayPaymentId") razorpayPaymentId: string,
    @Arg("razorpaySignature") razorpaySignature: string
  ): Promise<CustomerOrderView> {
    const order = await this.service.confirmPayment(
      ctx.customerId as string,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature
    );
    return toCustomerOrderView(order);
  }

  @Mutation(() => CustomerOrderView)
  @UseMiddleware(isCustomerAuthenticated)
  async requestOrderRefund(
    @Ctx() ctx: Context,
    @Arg("orderId") orderId: string,
    @Arg("reason") reason: string
  ): Promise<CustomerOrderView> {
    const order = await this.service.requestOrderRefund(
      ctx.customerId as string,
      orderId,
      reason
    );
    return toCustomerOrderView(order);
  }

  @Query(() => [CustomerOrderView])
  @UseMiddleware(isCustomerAuthenticated)
  async getMyOrders(
    @Ctx() ctx: Context,
    @Arg("input", { nullable: true }) input?: MyOrdersFilterInput
  ): Promise<CustomerOrderView[]> {
    const orders = await this.service.getMyOrders(
      ctx.customerId as string,
      input?.page ?? 1,
      input?.pageSize ?? 20
    );
    return orders.map(toCustomerOrderView);
  }

  @Query(() => CustomerOrderView, { nullable: true })
  @UseMiddleware(isCustomerAuthenticated)
  async getMyOrderById(
    @Ctx() ctx: Context,
    @Arg("orderId") orderId: string
  ): Promise<CustomerOrderView | null> {
    const order = await this.service.getMyOrderById(
      ctx.customerId as string,
      orderId
    );
    return order ? toCustomerOrderView(order) : null;
  }

  @Query(() => CustomerOrderInvoice, { nullable: true })
  @UseMiddleware(isCustomerAuthenticated)
  async getMyOrderInvoice(
    @Ctx() ctx: Context,
    @Arg("orderId") orderId: string
  ): Promise<CustomerOrderInvoice | null> {
    return this.service.getMyOrderInvoice(ctx.customerId as string, orderId);
  }
}
