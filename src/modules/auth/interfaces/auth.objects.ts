import { Field, ObjectType, registerEnumType } from "type-graphql";

@ObjectType()
export class CustomerOtpResponse {
  @Field(() => String)
  otpId: string;
}

@ObjectType()
export class CustomerAuthResponse {
  @Field(() => String)
  customerId: string;

  @Field(() => String)
  accessToken: string;

  @Field(() => String)
  refreshToken: string;
}

@ObjectType()
export class CustomerTokenRefreshResponse {
  @Field(() => Boolean)
  success: boolean;

  @Field(() => String, { nullable: true })
  accessToken?: string;

  @Field(() => String, { nullable: true })
  refreshToken?: string;
}

/**
 * Outcome of customerGoogleStart. Three possibilities:
 *   LOGGED_IN — already-linked Google account or matched-by-id login.
 *   LINKED_EXISTING_BY_EMAIL — Google email matched a phone-OTP customer
 *     who had no Google linked yet; we connected Google on the spot and
 *     issued tokens. Frontend shows a "we linked your Google sign-in"
 *     modal so the customer understands what happened.
 *   PENDING_PHONE_REQUIRED — no matching account exists; the customer
 *     must complete phone-OTP verification (using pendingToken) before
 *     the account is created.
 */
export enum GoogleStartOutcome {
  LOGGED_IN = "LOGGED_IN",
  LINKED_EXISTING_BY_EMAIL = "LINKED_EXISTING_BY_EMAIL",
  PENDING_PHONE_REQUIRED = "PENDING_PHONE_REQUIRED",
}
registerEnumType(GoogleStartOutcome, { name: "GoogleStartOutcome" });

@ObjectType()
export class GoogleStartPrefill {
  @Field(() => String, { nullable: true })
  email?: string;

  @Field(() => String, { nullable: true })
  firstName?: string;

  @Field(() => String, { nullable: true })
  lastName?: string;

  @Field(() => String, { nullable: true })
  picture?: string;
}

@ObjectType()
export class CustomerGoogleStartResponse {
  @Field(() => GoogleStartOutcome)
  outcome: GoogleStartOutcome;

  // Filled when outcome ∈ { LOGGED_IN, LINKED_EXISTING_BY_EMAIL }.
  @Field(() => String, { nullable: true })
  customerId?: string;

  @Field(() => String, { nullable: true })
  accessToken?: string;

  @Field(() => String, { nullable: true })
  refreshToken?: string;

  // Filled when outcome = PENDING_PHONE_REQUIRED. Client uses this
  // token in the follow-up phone-OTP mutations.
  @Field(() => String, { nullable: true })
  pendingToken?: string;

  @Field(() => GoogleStartPrefill, { nullable: true })
  prefill?: GoogleStartPrefill;
}

@ObjectType()
export class CustomerPendingSignupRequestOtpResponse {
  @Field(() => String)
  otpId: string;
}

/**
 * Outcome of pending-signup OTP verification. Two success paths
 * (NEW_ACCOUNT, LINKED_AS_SECONDARY) both return tokens; the latter
 * carries info the frontend uses to render an explanatory modal.
 * Rejections throw ErrorWithProps with a `code` so the frontend can
 * route to the matching modal.
 */
export enum PendingSignupOutcome {
  NEW_ACCOUNT = "NEW_ACCOUNT",
  LINKED_AS_SECONDARY = "LINKED_AS_SECONDARY",
}
registerEnumType(PendingSignupOutcome, { name: "PendingSignupOutcome" });

@ObjectType()
export class CustomerPendingSignupVerifyOtpResponse {
  @Field(() => PendingSignupOutcome)
  outcome: PendingSignupOutcome;

  @Field(() => String)
  customerId: string;

  @Field(() => String)
  accessToken: string;

  @Field(() => String)
  refreshToken: string;

  // When outcome = LINKED_AS_SECONDARY, expose the masked primary
  // email + which email landed on the secondary slot so the frontend
  // modal can say "We linked your Google email <x> as secondary on
  // your existing account <masked primary>".
  @Field(() => String, { nullable: true })
  primaryEmailMasked?: string;

  @Field(() => String, { nullable: true })
  secondaryEmail?: string;
}
