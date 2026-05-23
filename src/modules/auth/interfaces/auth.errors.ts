/**
 * Stable error codes returned via ErrorWithProps `code` for the
 * customer-auth pipeline. The hoizr-client frontend keys collision
 * modals + remediation copy on these — DO NOT rename without updating
 * the frontend in the same change.
 */
export const CustomerAuthErrorCodes = {
  APPLE_NOT_CONFIGURED: "APPLE_NOT_CONFIGURED",
  INVALID_GOOGLE_TOKEN: "INVALID_GOOGLE_TOKEN",
  GOOGLE_EMAIL_NOT_VERIFIED: "GOOGLE_EMAIL_NOT_VERIFIED",
  PENDING_TOKEN_EXPIRED: "PENDING_TOKEN_EXPIRED",
  PHONE_ACCOUNT_FULL: "PHONE_ACCOUNT_FULL",
  EMAIL_USED_ELSEWHERE: "EMAIL_USED_ELSEWHERE",
  MISSING_REQUIRED_PROFILE_FIELDS: "MISSING_REQUIRED_PROFILE_FIELDS",
} as const;

export type CustomerAuthErrorCode =
  (typeof CustomerAuthErrorCodes)[keyof typeof CustomerAuthErrorCodes];
