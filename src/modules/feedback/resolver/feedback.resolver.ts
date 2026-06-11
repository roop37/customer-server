import {
  HostFeedbackContext,
  HostFeedbackKind,
  HostFeedbackSource,
} from "@hoizr-technology/shared";
import { ErrorWithProps } from "mercurius";
import { Arg, Ctx, Int, Mutation, Resolver, UseMiddleware } from "type-graphql";
import { isCustomerAuthenticated } from "../../../middlewares/customer-auth";
import Context from "../../../types/context.type";
import { OrderModel } from "../../order/schema/order.schema";
import { HostFeedbackModel } from "../schema/host-feedback.schema";

@Resolver()
export class CustomerFeedbackResolver {
  /**
   * Customer submits feedback tied to one of their orders. EVENT-kind goes to
   * the host's Feedbacks tab; HOIZR_PLATFORM is platform sentiment. Idempotent
   * per (customer, order, kind) — re-submitting updates the same row.
   */
  @Mutation(() => Boolean)
  @UseMiddleware(isCustomerAuthenticated)
  async submitCustomerFeedback(
    @Arg("orderId") orderId: string,
    @Arg("kind", () => String) kind: string,
    @Arg("context", () => String) context: string,
    @Arg("rating", () => Int, { nullable: true }) rating: number | undefined,
    @Arg("comment", () => String, { nullable: true }) comment: string | undefined,
    @Ctx() ctx: Context
  ): Promise<boolean> {
    const customerId = ctx.customerId;
    if (!customerId) throw new ErrorWithProps("Not authenticated");
    if (rating == null && !comment?.trim()) {
      throw new ErrorWithProps("Add a rating or a comment");
    }
    const feedbackKind =
      kind === "HOIZR_PLATFORM"
        ? HostFeedbackKind.HOIZR_PLATFORM
        : HostFeedbackKind.EVENT;
    const feedbackContext =
      (HostFeedbackContext as any)[context] ??
      HostFeedbackContext.CUSTOMER_POST_EVENT;

    const order: any = await OrderModel.findOne({ _id: orderId, customerId })
      .select("eventId businessId")
      .lean();
    if (!order) throw new ErrorWithProps("Order not found");

    await HostFeedbackModel.findOneAndUpdate(
      {
        customerId,
        eventId: String(order.eventId),
        kind: feedbackKind,
      },
      {
        $set: {
          source: HostFeedbackSource.CUSTOMER,
          kind: feedbackKind,
          context: feedbackContext,
          hostId: String(order.businessId),
          eventId: String(order.eventId),
          customerId,
          rating: rating ?? undefined,
          comment: comment?.trim() || undefined,
          channel: "in_app",
        },
      },
      { upsert: true, new: true }
    );
    return true;
  }
}
