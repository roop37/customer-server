import { ErrorWithProps } from "mercurius";
import type { MiddlewareFn } from "type-graphql";
import Context from "../types/context.type";

export const isScannerAuthenticated: MiddlewareFn<Context> = async (
  { context },
  next
) => {
  if (!context.scannerId || !context.scannerEventId) {
    // `code: "UNAUTHENTICATED"` is surfaced via extensions to the client.
    // The Flutter scanner uses the code (not message substring matching)
    // to decide whether to attempt a refresh-and-retry. Don't rename
    // without updating hoizr-scanner-app/lib/services/graphql_service.dart.
    throw new ErrorWithProps("Scanner not authenticated", {
      statusCode: 401,
      code: "UNAUTHENTICATED",
    });
  }
  return next();
};
