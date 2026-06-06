import { Field, InputType, ObjectType } from "type-graphql";

@InputType()
export class ConnectInstagramInput {
  /**
   * Short-lived OAuth code returned by Meta after the authorise
   * redirect. Set by the /auth/instagram/callback Fastify route — NOT
   * meant to be sent by the GraphQL client directly. When real Meta
   * is configured this is the ONLY accepted input; the handle path is
   * rejected (see service.ts comment + the 2026-06-06 security review).
   */
  @Field(() => String, { nullable: true })
  oauthCode?: string;

  /**
   * Dev/preview ONLY. When `META_INSTAGRAM_APP_ID` is unset (no Meta
   * app registered yet), the service seeds a deterministic synthetic
   * profile from this handle. Any production-shaped environment MUST
   * leave this unset — it would otherwise allow identity spoofing.
   */
  @Field(() => String, { nullable: true })
  handle?: string;
}

@InputType()
export class UpdateInstagramVisibilityInput {
  @Field(() => Boolean)
  attendeeVisibility: boolean;
}

@ObjectType()
export class EventAttendeeWithInstagram {
  @Field(() => String)
  customerId: string;

  @Field(() => String, { nullable: true })
  firstName?: string;

  @Field(() => String, { nullable: true })
  handle?: string;

  @Field(() => String, { nullable: true })
  avatar?: string;

  @Field(() => String, { nullable: true })
  city?: string;
}
