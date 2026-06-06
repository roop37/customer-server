import { getModelForClass, prop } from "@typegoose/typegoose";
import { Field, ID, Int, ObjectType } from "type-graphql";

/**
 * Customer Instagram connection.
 *
 * ─────────────────────────────────────────────────────────────────────
 *   POST-PUBLISH SWAP — TODO (once `@hoizr-technology/shared@0.1.80`
 *   is published to the GitHub npm registry and installed in this
 *   workspace, replace the entire body of this file with:
 *
 *       import {
 *         CustomerInstagram,
 *         CustomerInstagramMedia,
 *       } from "@hoizr-technology/shared";
 *       import { getModelForClass } from "@typegoose/typegoose";
 *
 *       const CustomerInstagramModel = getModelForClass(
 *         CustomerInstagram,
 *         { schemaOptions: {
 *             timestamps: true,
 *             collection: "customer_instagram",
 *         }},
 *       );
 *       export { CustomerInstagram, CustomerInstagramMedia,
 *                CustomerInstagramModel };
 *
 *   The class body below is BYTE-FOR-BYTE identical to the one in
 *   `hoizr-shared/src/schemas/customer-instagram.schema.ts` — don't
 *   drift one without the other. The publish step in
 *   `docs/INSTAGRAM_CONNECT.md` §14 makes the local copy obsolete.
 * ─────────────────────────────────────────────────────────────────────
 *
 * Lives in its OWN collection (`customer_instagram`) rather than
 * embedded on `Customer` so the auth churn here doesn't force a write
 * on the Customer doc (read-heavy across the app).
 */

@ObjectType()
export class CustomerInstagramMedia {
  @Field(() => String)
  @prop({ required: true })
  id: string;

  @Field(() => String, { nullable: true })
  @prop()
  caption?: string;

  @Field(() => String)
  @prop({ required: true })
  mediaUrl: string;

  @Field(() => String, { nullable: true })
  @prop()
  thumbnailUrl?: string;

  @Field(() => String, { nullable: true })
  @prop()
  permalink?: string;

  @Field(() => String, { nullable: true })
  @prop()
  mediaType?: string;

  @Field(() => Date, { nullable: true })
  @prop()
  takenAt?: Date;
}

@ObjectType()
export class CustomerInstagram {
  @Field(() => ID)
  _id: string;

  @Field(() => String)
  @prop({ required: true, unique: true })
  customerId: string;

  @Field(() => Boolean)
  @prop({ default: false })
  connected: boolean;

  @Field(() => Boolean)
  @prop({ default: false })
  attendeeVisibility: boolean;

  @Field(() => String, { nullable: true })
  @prop()
  handle?: string;

  @Field(() => String, { nullable: true })
  @prop()
  instagramUserId?: string;

  @Field(() => String, { nullable: true })
  @prop()
  avatar?: string;

  @Field(() => String, { nullable: true })
  @prop()
  biography?: string;

  @Field(() => Int, { nullable: true })
  @prop()
  followerCount?: number;

  @Field(() => Int, { nullable: true })
  @prop()
  mediaCount?: number;

  @Field(() => [CustomerInstagramMedia], { nullable: true })
  @prop({ type: () => [CustomerInstagramMedia], _id: false, default: [] })
  recentMedia?: CustomerInstagramMedia[];

  @Field(() => String, { nullable: true })
  @prop()
  city?: string;

  @prop()
  accessToken?: string;

  @Field(() => Date, { nullable: true })
  @prop()
  tokenExpiresAt?: Date;

  @Field(() => Date, { nullable: true })
  @prop()
  connectedAt?: Date;

  @Field(() => Date, { nullable: true })
  @prop()
  lastSyncedAt?: Date;

  @prop()
  lastPushedAvatar?: string;

  @Field(() => Date, { nullable: true })
  createdAt?: Date;

  @Field(() => Date, { nullable: true })
  updatedAt?: Date;
}

export const CustomerInstagramModel = getModelForClass(CustomerInstagram, {
  schemaOptions: {
    timestamps: true,
    collection: "customer_instagram",
  },
});
