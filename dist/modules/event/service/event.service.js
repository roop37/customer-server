"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const shared_1 = require("@hoizr-technology/shared");
const mercurius_1 = require("mercurius");
const mongoose_1 = require("mongoose");
const artist_follow_schema_1 = require("../../artistFollow/schema/artist-follow.schema");
const event_schema_1 = require("../schema/event.schema");
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
class PublicEventService {
    async getEventBySlug(slug) {
        if (!slug)
            throw new mercurius_1.ErrorWithProps("Slug is required");
        const visibilityFilter = {
            isDeleted: false,
            isVisible: true,
            status: shared_1.EventStatus.PUBLISHED,
            adminPaused: { $ne: true },
        };
        const event = await event_schema_1.EventModel.findOne({
            slug,
            ...visibilityFilter,
        }).lean();
        if (event)
            return event;
        // ID fallback. Older campaigns + hand-pasted host ctaLinks sometimes
        // produce /events/<ObjectId> URLs even though the canonical SEO URL
        // is /events/<slug>. Recognise a 24-char hex ObjectId and fall back
        // to findById with the same visibility gates so the email link is
        // never a 404 just because the surrounding code used the wrong id.
        if (mongoose_1.Types.ObjectId.isValid(slug) && /^[a-f0-9]{24}$/i.test(slug)) {
            const byId = await event_schema_1.EventModel.findOne({
                _id: slug,
                ...visibilityFilter,
            }).lean();
            if (byId)
                return byId;
        }
        return null;
    }
    async getEventById(id) {
        if (!id)
            throw new mercurius_1.ErrorWithProps("Event ID is required");
        const event = await event_schema_1.EventModel.findOne({
            _id: id,
            isDeleted: false,
            isVisible: true,
            status: shared_1.EventStatus.PUBLISHED,
            adminPaused: { $ne: true },
        }).lean();
        return event ?? null;
    }
    async getPublishedEvents(input) {
        const page = Math.max(1, input.page ?? 1);
        const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 20));
        const now = new Date();
        const query = {
            status: shared_1.EventStatus.PUBLISHED,
            isDeleted: false,
            isVisible: true,
            adminPaused: { $ne: true },
            // Only show events whose startDate is still in the future. Once
            // an event has started (or finished), it disappears from the
            // listing — customers can't book a show that's already begun.
            // isComingSoon no longer overrides the date gate; a stale flag
            // can't surface an already-started event.
            startDate: { $gte: now },
        };
        if (input.cityId)
            query.cityId = input.cityId;
        else if (input.city)
            query.city = new RegExp(`^${escapeRegex(input.city)}$`, "i");
        if (input.eventCategoryIds?.length) {
            query.eventCategoryId = { $in: input.eventCategoryIds };
        }
        if (input.genreTagIds?.length) {
            query.genreTagIds = { $in: input.genreTagIds };
        }
        if (input.startDateFrom || input.startDateTo) {
            query.startDate = {};
            if (input.startDateFrom && input.startDateFrom > now) {
                query.startDate.$gte = input.startDateFrom;
            }
            else {
                query.startDate.$gte = now;
            }
            if (input.startDateTo)
                query.startDate.$lte = input.startDateTo;
        }
        if (input.search) {
            const term = input.search.trim();
            if (term) {
                const safeTerm = escapeRegex(term);
                query.$and = [
                    {
                        $or: [
                            { title: { $regex: safeTerm, $options: "i" } },
                            { description: { $regex: safeTerm, $options: "i" } },
                        ],
                    },
                ];
            }
        }
        const [events, total] = await Promise.all([
            event_schema_1.EventModel.find(query)
                .sort({ isHighDemand: -1, startDate: 1, createdAt: -1 })
                .skip((page - 1) * pageSize)
                .limit(pageSize)
                .lean(),
            event_schema_1.EventModel.countDocuments(query),
        ]);
        let filtered = events;
        if (input.minPrice !== undefined || input.maxPrice !== undefined) {
            filtered = events.filter((event) => {
                const prices = (event.tickets ?? [])
                    .filter((t) => (t.ticketVisible ?? true) && !t.markAsComingSoon)
                    .map((t) => Number(t.ticketPrice ?? 0));
                if (!prices.length)
                    return false;
                const min = Math.min(...prices);
                if (input.minPrice !== undefined && min < input.minPrice)
                    return false;
                if (input.maxPrice !== undefined && min > input.maxPrice)
                    return false;
                return true;
            });
        }
        return { events: filtered, total, page, pageSize };
    }
    /**
     * People associated with an event: the lineup (real Artist rows or
     * PhantomArtist stand-ins), the organizer (event.hostId → Host) and
     * collaborators (event.eventCollaborationBusiness[].businessLinkId →
     * Host). One query for the customer event detail page so the UI
     * doesn't need to fan out client-side.
     */
    async getEventPeople(eventId) {
        if (!eventId)
            throw new mercurius_1.ErrorWithProps("Event ID is required");
        const event = await event_schema_1.EventModel.findOne({
            _id: eventId,
            isDeleted: false,
            isVisible: true,
            status: shared_1.EventStatus.PUBLISHED,
            adminPaused: { $ne: true },
        }).lean();
        if (!event)
            return { artists: [], organizers: [] };
        // ---------- Artists --------------------------------------------------
        const lineup = (event.lineup ?? []).filter(Boolean);
        const artistLinkIds = lineup
            .map((l) => l.artistLinkId)
            .filter((id) => Boolean(id) && mongoose_1.Types.ObjectId.isValid(id));
        const phantomIds = lineup
            .map((l) => l.tempArtistId)
            .filter((id) => Boolean(id) && mongoose_1.Types.ObjectId.isValid(id));
        const [artistRows, phantomRows] = await Promise.all([
            artistLinkIds.length
                ? artist_follow_schema_1.ArtistModel.find({
                    _id: { $in: artistLinkIds },
                    isDeleted: false,
                }).lean()
                : Promise.resolve([]),
            phantomIds.length
                ? event_schema_1.PhantomArtistModel.find({
                    _id: { $in: phantomIds },
                    isDeleted: false,
                }).lean()
                : Promise.resolve([]),
        ]);
        const artistById = new Map(artistRows.map((row) => [String(row._id), row]));
        const phantomById = new Map(phantomRows.map((row) => [String(row._id), row]));
        // Preserve lineup order so the "headliner first" intent the host
        // expressed when arranging the line-up is what the customer sees.
        const artists = lineup.map((entry) => {
            const artist = entry.artistLinkId
                ? artistById.get(String(entry.artistLinkId))
                : null;
            if (artist) {
                const fullName = [artist.firstName, artist.lastName]
                    .filter(Boolean)
                    .join(" ")
                    .trim();
                return {
                    _id: String(artist._id),
                    name: fullName || entry.name,
                    picture: artist.profilePhoto ?? entry.picture ?? undefined,
                    tagline: artist.tagline ?? undefined,
                    bio: artist.bio ?? undefined,
                    slug: artist.slug ?? undefined,
                    instagramLink: artist.instagramLink ?? entry.instagramLink,
                    spotifyLink: artist.spotifyLink ?? entry.spotifyLink,
                    youtubeLink: artist.youtubeLink ?? entry.youtubeLink,
                    isPhantom: false,
                };
            }
            const phantom = entry.tempArtistId
                ? phantomById.get(String(entry.tempArtistId))
                : null;
            if (phantom) {
                return {
                    _id: String(phantom._id),
                    name: phantom.name ?? entry.name,
                    picture: phantom.picture ?? entry.picture ?? undefined,
                    instagramLink: phantom.instagramLink ?? entry.instagramLink,
                    spotifyLink: phantom.spotifyLink ?? entry.spotifyLink,
                    youtubeLink: phantom.youtubeLink ?? entry.youtubeLink,
                    isPhantom: true,
                };
            }
            // Free-text entry — no Artist row, no PhantomArtist. Use the
            // raw fields the host typed at lineup time.
            return {
                name: entry.name,
                picture: entry.picture ?? undefined,
                instagramLink: entry.instagramLink ?? undefined,
                spotifyLink: entry.spotifyLink ?? undefined,
                youtubeLink: entry.youtubeLink ?? undefined,
                isPhantom: true,
            };
        });
        // ---------- Organizer + collaborators ------------------------------
        const collaborators = (event.eventCollaborationBusiness ?? []).filter((c) => !c.hideOnEventPage);
        const collabBusinessIds = collaborators
            .map((c) => c.businessLinkId)
            .filter((id) => Boolean(id) && mongoose_1.Types.ObjectId.isValid(id));
        const allHostIds = [event.hostId, ...collabBusinessIds]
            .filter((id) => Boolean(id) && mongoose_1.Types.ObjectId.isValid(id));
        const hostRows = allHostIds.length
            ? await event_schema_1.HostModel.find({
                _id: { $in: allHostIds },
            }).lean()
            : [];
        const hostById = new Map(hostRows.map((row) => [String(row._id), row]));
        const organizers = [];
        const primaryHost = event.hostId
            ? hostById.get(String(event.hostId))
            : null;
        if (primaryHost) {
            organizers.push({
                _id: String(primaryHost._id),
                name: primaryHost.name ?? "Event organizer",
                logo: primaryHost.logo ?? primaryHost.brandingLogo ?? undefined,
                description: primaryHost.description ?? undefined,
                city: primaryHost.address?.city ?? undefined,
                isPrimary: true,
            });
        }
        for (const collab of collaborators) {
            const host = collab.businessLinkId
                ? hostById.get(String(collab.businessLinkId))
                : null;
            organizers.push({
                _id: host ? String(host._id) : undefined,
                name: host?.name ?? collab.name,
                logo: host?.logo ?? host?.brandingLogo ?? collab.logo ?? undefined,
                description: host?.description ?? undefined,
                city: host?.address?.city ?? undefined,
                isPrimary: false,
            });
        }
        return { artists, organizers };
    }
}
exports.default = PublicEventService;
