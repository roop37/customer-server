import {
  Artist,
  ArtistFollow,
  ArtistStatus,
  EventStatus,
  LifecycleEmailType,
} from "@hoizr-technology/shared";
import { getModelForClass } from "@typegoose/typegoose";
import { ErrorWithProps } from "mercurius";
import Context from "../../../types/context.type";
import { Customer } from "@hoizr-technology/shared";
import { enqueueLifecycleEmail } from "../../../utils/lifecycle.queue";
import { isAlphanumeric } from "../../../utils/validations";
import { EventModel } from "../../../modules/event/schema/event.schema";
import {
  ArtistFollowModel,
  ArtistModel,
} from "../schema/artist-follow.schema";

const CustomerModelLocal = getModelForClass(Customer, {
  schemaOptions: { timestamps: true },
});

class ArtistFollowService {
  private requireCustomerId(ctx: Context): string {
    if (!ctx.customerId) {
      throw new ErrorWithProps("Not authenticated", { statusCode: 401 });
    }
    return ctx.customerId;
  }

  async follow(artistId: string, ctx: Context): Promise<ArtistFollow> {
    const customerId = this.requireCustomerId(ctx);
    if (!isAlphanumeric(artistId)) {
      throw new ErrorWithProps("Invalid artist id");
    }

    const artist = await ArtistModel.findOne({
      _id: artistId,
      isDeleted: false,
    })
      .select("_id status")
      .lean<{ _id: string; status: ArtistStatus }>();
    if (!artist) throw new ErrorWithProps("Artist not found");
    if (
      artist.status !== ArtistStatus.ACTIVE &&
      artist.status !== ArtistStatus.PENDING_PROFILE
    ) {
      throw new ErrorWithProps("Artist is not available to follow");
    }

    // Idempotent: rely on the unique (artistId, customerId) index.
    try {
      const created = await ArtistFollowModel.create({
        artistId,
        customerId,
        followedAt: new Date(),
      });
      const updated = await ArtistModel.findOneAndUpdate(
        { _id: artistId },
        { $inc: { totalFollowersCount: 1 } },
        { new: true }
      )
        .select("email firstName lastName totalFollowersCount")
        .lean<{
          email?: string;
          firstName?: string;
          lastName?: string;
          totalFollowersCount?: number;
        }>();

      // Notify the artist of their new follower (fire-and-forget).
      if (updated?.email) {
        const customer = await CustomerModelLocal.findById(customerId)
          .select("firstName lastName")
          .lean<{ firstName?: string; lastName?: string }>();
        const followerName = customer
          ? `${customer.firstName ?? ""} ${customer.lastName ?? ""}`.trim() ||
            "A new fan"
          : "A new fan";
        enqueueLifecycleEmail(
          LifecycleEmailType.ARTIST_NEW_FOLLOWER,
          updated.email,
          `${updated.firstName ?? ""} ${updated.lastName ?? ""}`.trim() ||
            "Artist",
          {
            artistId,
            followerName,
            totalFollowers: updated.totalFollowersCount ?? 0,
          }
        ).catch((_err: unknown) => {});
      }

      return created.toObject() as ArtistFollow;
    } catch (err: any) {
      // Duplicate key — already a follower. Return the existing row so
      // the client can treat follow as idempotent.
      if (err?.code === 11000) {
        const existing = await ArtistFollowModel.findOne({
          artistId,
          customerId,
        }).lean<ArtistFollow>();
        if (existing) return existing;
      }
      throw err;
    }
  }

  async unfollow(artistId: string, ctx: Context): Promise<boolean> {
    const customerId = this.requireCustomerId(ctx);
    if (!isAlphanumeric(artistId)) {
      throw new ErrorWithProps("Invalid artist id");
    }

    const res = await ArtistFollowModel.findOneAndDelete({
      artistId,
      customerId,
    }).lean();
    if (res) {
      await ArtistModel.updateOne(
        { _id: artistId, totalFollowersCount: { $gt: 0 } },
        { $inc: { totalFollowersCount: -1 } }
      );
    }
    return Boolean(res);
  }

  async listFollowedArtists(ctx: Context): Promise<Artist[]> {
    const customerId = this.requireCustomerId(ctx);
    const follows = await ArtistFollowModel.find({ customerId })
      .sort({ followedAt: -1 })
      .lean<{ artistId: string }[]>();
    if (!follows.length) return [];
    const ids = follows.map((f) => f.artistId);
    const artists = await ArtistModel.find({
      _id: { $in: ids },
      isDeleted: false,
    }).lean<Artist[]>();
    // Preserve follow order.
    const order = new Map(ids.map((id, i) => [String(id), i]));
    return artists.sort(
      (a, b) =>
        (order.get(String(a._id)) ?? 0) - (order.get(String(b._id)) ?? 0)
    );
  }

  async isFollowing(artistId: string, ctx: Context): Promise<boolean> {
    if (!ctx.customerId) return false;
    if (!isAlphanumeric(artistId)) return false;
    return Boolean(
      await ArtistFollowModel.exists({
        artistId,
        customerId: ctx.customerId,
      })
    );
  }

  async listUpcomingEventsForFollowedArtists(
    ctx: Context
  ): Promise<any[]> {
    const customerId = this.requireCustomerId(ctx);
    const follows = await ArtistFollowModel.find({ customerId })
      .select("artistId")
      .lean<{ artistId: string }[]>();
    if (!follows.length) return [];
    const artistIds = follows.map((f) => f.artistId);
    return EventModel.find({
      isDeleted: false,
      status: EventStatus.PUBLISHED,
      "lineup.artistLinkId": { $in: artistIds },
      startDate: { $gte: new Date() },
    })
      .select("_id title city startDate coverImage lineup hostId")
      .sort({ startDate: 1 })
      .limit(50)
      .lean<any[]>();
  }
}

export default ArtistFollowService;
