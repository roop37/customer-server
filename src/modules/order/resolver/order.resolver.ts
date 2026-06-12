import { Arg, Ctx, Mutation, Query, Resolver, UseMiddleware } from "type-graphql";
import { isCustomerAuthenticated } from "../../../middlewares/customer-auth";
import Context from "../../../types/context.type";
import {
  CreateOrderInput,
  GuestOrderInput,
  MyOrdersFilterInput,
  PreviewCouponInput,
} from "../interfaces/order.input";
import {
  CouponPreviewView,
  CreateOrderResponse,
  CustomerOrderInvoice,
  GuestCheckoutResponse,
  OfflinePaymentLinkView,
  PublicCoupon,
} from "../interfaces/order.objects";
import { CustomerOrderView, toCustomerOrderView } from "../interfaces/order.view";
import OrderService from "../service/order.service";
import {
  CustomerCookieKeys,
  setCustomerCookie,
} from "../../../utils/cookie";

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
   * Guest checkout — PUBLIC (no customer auth). The buyer submits selected
   * tickets + contact details from the "Continue to checkout" modal. We
   * resolve/create the customer by phone and run the normal order flow.
   * (Rate-limit at the gateway/middleware level; value is gated by Razorpay.)
   */
  /** Resolve a host's offline payment link → prefill for the checkout page. */
  @Query(() => OfflinePaymentLinkView)
  async offlinePaymentLink(
    @Arg("shortCode") shortCode: string
  ): Promise<OfflinePaymentLinkView> {
    return this.service.resolveOfflinePaymentLink(shortCode) as any;
  }

  /**
   * Validate a promo code at checkout — PUBLIC so guests can preview too.
   * Per-customer limits (maxUsagePerCustomer, FirstSignedOrder) only apply
   * when the buyer is logged in; ctx.customerId is read opportunistically.
   */
  @Query(() => CouponPreviewView)
  async previewCoupon(
    @Ctx() ctx: Context,
    @Arg("input") input: PreviewCouponInput
  ): Promise<CouponPreviewView> {
    return this.service.previewCoupon(input, ctx.customerId);
  }

  /** Public, copyable promo codes a host chose to show on an event page. */
  @Query(() => [PublicCoupon])
  async visibleCouponsForEvent(
    @Arg("eventId") eventId: string
  ): Promise<PublicCoupon[]> {
    return this.service.visibleCouponsForEvent(eventId) as any;
  }

  @Mutation(() => GuestCheckoutResponse)
  async createGuestOrder(
    @Arg("input") input: GuestOrderInput,
    @Ctx() ctx: Context
  ): Promise<GuestCheckoutResponse> {
    const { result, accountFound, accountEmail, loggedIn, session } =
      await this.service.createGuestOrder(input);
    // New-account session → set the same httpOnly auth cookies the OTP-verify
    // path sets, so the buyer is logged in immediately. Tokens never appear in
    // the GraphQL body — only `loggedIn` is surfaced.
    if (session) {
      setCustomerCookie(
        CustomerCookieKeys.ACCESS_TOKEN,
        session.accessToken,
        ctx.rep
      );
      setCustomerCookie(
        CustomerCookieKeys.REFRESH_TOKEN,
        session.refreshToken,
        ctx.rep
      );
      setCustomerCookie(
        CustomerCookieKeys.UNIQUE_ID,
        session.uniqueId,
        ctx.rep
      );
    }
    return {
      order: toCustomerOrderView(result.order),
      checkout: result.checkout,
      accountFound,
      accountEmail,
      loggedIn,
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
