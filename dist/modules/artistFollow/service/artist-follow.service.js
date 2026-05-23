"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const shared_1 = require("@hoizr-technology/shared");
const typegoose_1 = require("@typegoose/typegoose");
const mercurius_1 = require("mercurius");
const shared_2 = require("@hoizr-technology/shared");
const lifecycle_queue_1 = require("../../../utils/lifecycle.queue");
const validations_1 = require("../../../utils/validations");
const event_schema_1 = require("../../../modules/event/schema/event.schema");
const artist_follow_schema_1 = require("../schema/artist-follow.schema");
const CustomerModelLocal = (0, typegoose_1.getModelForClass)(shared_2.Customer, {
    schemaOptions: { timestamps: true },
});
class ArtistFollowService {
    requireCustomerId(ctx) {
        if (!ctx.customerId) {
            throw new mercurius_1.ErrorWithProps("Not authenticated", { statusCode: 401 });
        }
        return ctx.customerId;
    }
    async follow(artistId, ctx) {
        const customerId = this.requireCustomerId(ctx);
        if (!(0, validations_1.isAlphanumeric)(artistId)) {
            throw new mercurius_1.ErrorWithProps("Invalid artist id");
        }
        const artist = await artist_follow_schema_1.ArtistModel.findOne({
            _id: artistId,
            isDeleted: false,
        })
            .select("_id status")
            .lean();
        if (!artist)
            throw new mercurius_1.ErrorWithProps("Artist not found");
        if (artist.status !== shared_1.ArtistStatus.ACTIVE &&
            artist.status !== shared_1.ArtistStatus.PENDING_PROFILE) {
            throw new mercurius_1.ErrorWithProps("Artist is not available to follow");
        }
        // Idempotent: rely on the unique (artistId, customerId) index.
        try {
            const created = await artist_follow_schema_1.ArtistFollowModel.create({
                artistId,
                customerId,
                followedAt: new Date(),
            });
            const updated = await artist_follow_schema_1.ArtistModel.findOneAndUpdate({ _id: artistId }, { $inc: { totalFollowersCount: 1 } }, { new: true })
                .select("email firstName lastName totalFollowersCount")
                .lean();
            // Notify the artist of their new follower (fire-and-forget).
            if (updated?.email) {
                const customer = await CustomerModelLocal.findById(customerId)
                    .select("firstName lastName")
                    .lean();
                const followerName = customer
                    ? `${customer.firstName ?? ""} ${customer.lastName ?? ""}`.trim() ||
                        "A new fan"
                    : "A new fan";
                (0, lifecycle_queue_1.enqueueLifecycleEmail)(shared_1.LifecycleEmailType.ARTIST_NEW_FOLLOWER, updated.email, `${updated.firstName ?? ""} ${updated.lastName ?? ""}`.trim() ||
                    "Artist", {
                    artistId,
                    followerName,
                    totalFollowers: updated.totalFollowersCount ?? 0,
                }).catch((_err) => { });
            }
            return created.toObject();
        }
        catch (err) {
            // Duplicate key — already a follower. Return the existing row so
            // the client can treat follow as idempotent.
            if (err?.code === 11000) {
                const existing = await artist_follow_schema_1.ArtistFollowModel.findOne({
                    artistId,
                    customerId,
                }).lean();
                if (existing)
                    return existing;
            }
            throw err;
        }
    }
    async unfollow(artistId, ctx) {
        const customerId = this.requireCustomerId(ctx);
        if (!(0, validations_1.isAlphanumeric)(artistId)) {
            throw new mercurius_1.ErrorWithProps("Invalid artist id");
        }
        const res = await artist_follow_schema_1.ArtistFollowModel.findOneAndDelete({
            artistId,
            customerId,
        }).lean();
        if (res) {
            await artist_follow_schema_1.ArtistModel.updateOne({ _id: artistId, totalFollowersCount: { $gt: 0 } }, { $inc: { totalFollowersCount: -1 } });
        }
        return Boolean(res);
    }
    async listFollowedArtists(ctx) {
        const customerId = this.requireCustomerId(ctx);
        const follows = await artist_follow_schema_1.ArtistFollowModel.find({ customerId })
            .sort({ followedAt: -1 })
            .lean();
        if (!follows.length)
            return [];
        const ids = follows.map((f) => f.artistId);
        const artists = await artist_follow_schema_1.ArtistModel.find({
            _id: { $in: ids },
            isDeleted: false,
        }).lean();
        // Preserve follow order.
        const order = new Map(ids.map((id, i) => [String(id), i]));
        return artists.sort((a, b) => (order.get(String(a._id)) ?? 0) - (order.get(String(b._id)) ?? 0));
    }
    async isFollowing(artistId, ctx) {
        if (!ctx.customerId)
            return false;
        if (!(0, validations_1.isAlphanumeric)(artistId))
            return false;
        return Boolean(await artist_follow_schema_1.ArtistFollowModel.exists({
            artistId,
            customerId: ctx.customerId,
        }));
    }
    async listUpcomingEventsForFollowedArtists(ctx) {
        const customerId = this.requireCustomerId(ctx);
        const follows = await artist_follow_schema_1.ArtistFollowModel.find({ customerId })
            .select("artistId")
            .lean();
        if (!follows.length)
            return [];
        const artistIds = follows.map((f) => f.artistId);
        return event_schema_1.EventModel.find({
            isDeleted: false,
            status: shared_1.EventStatus.PUBLISHED,
            "lineup.artistLinkId": { $in: artistIds },
            startDate: { $gte: new Date() },
        })
            .select("_id title city startDate coverImage lineup hostId")
            .sort({ startDate: 1 })
            .limit(50)
            .lean();
    }
}
exports.default = ArtistFollowService;
