import { Field, InputType } from "type-graphql";

@InputType()
export class CustomerOtpRequestInput {
  @Field(() => String)
  phone: string;
}

@InputType()
export class CustomerOtpVerifyInput {
  @Field(() => String)
  phone: string;

  @Field(() => String)
  otpId: string;

  @Field(() => String)
  otp: string;

  // Required when creating a brand-new customer via the phone-OTP path.
  // For an existing customer signing in, these may be omitted.
  // The service enforces presence on the new-account branch.
  @Field(() => String, { nullable: true })
  firstName?: string;

  @Field(() => String, { nullable: true })
  lastName?: string;

  @Field(() => String, { nullable: true })
  email?: string;
}

@InputType()
export class CustomerGoogleStartInput {
  // ID token returned by @react-oauth/google on hoizr-client. Server
  // verifies it against GOOGLE_OAUTH_CLIENT_ID, then either logs the
  // customer in (existing account by googleId or email match) or
  // opens a pending-signup that must complete phone-OTP verification
  // before the account is created.
  @Field(() => String)
  idToken: string;
}

@InputType()
export class CustomerAppleStartInput {
  // Apple identity token. Wired but stubbed — resolver throws
  // APPLE_NOT_CONFIGURED until the Apple Developer programme keys are
  // provisioned. See /docs/APPLE_SIGN_IN_ENABLEMENT.md.
  @Field(() => String)
  idToken: string;
}

@InputType()
export class CustomerPendingSignupRequestOtpInput {
  @Field(() => String)
  pendingToken: string;

  @Field(() => String)
  phone: string;
}

@InputType()
export class CustomerPendingSignupVerifyOtpInput {
  @Field(() => String)
  pendingToken: string;

  @Field(() => String)
  otp: string;

  @Field(() => String)
  firstName: string;

  @Field(() => String)
  lastName: string;

  // Optional — when the OAuth provider returned an email, it's already
  // baked into the pending entry. The user may override here. When no
  // OAuth email was provided (rare for Apple, never for Google), this
  // is required and the service rejects when missing.
  @Field(() => String, { nullable: true })
  email?: string;
}
