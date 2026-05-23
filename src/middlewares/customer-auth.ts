import { ErrorWithProps } from "mercurius";
import type { MiddlewareFn } from "type-graphql";
import Context from "../types/context.type";

export const isCustomerAuthenticated: MiddlewareFn<Context> = async (
  { context },
  next
) => {
  if (!context.customerId) {
    throw new ErrorWithProps("Not authenticated", {
      statusCode: 401,
      code: "UNAUTHENTICATED",
    });
  }
  return next();
};
