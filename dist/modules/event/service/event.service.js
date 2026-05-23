"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const shared_1 = require("@hoizr-technology/shared");
const mercurius_1 = require("mercurius");
const event_schema_1 = require("../schema/event.schema");
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
class PublicEventService {
    async getEventBySlug(slug) {
        if (!slug)
            throw new mercurius_1.ErrorWithProps("Slug is required");
        const event = await event_schema_1.EventModel.findOne({
            slug,
            isDeleted: false,
            isVisible: true,
            status: shared_1.EventStatus.PUBLISHED,
            adminPaused: { $ne: true },
        }).lean();
        return event ?? null;
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
            $or: [
                { startDate: { $gte: now } },
                { endDate: { $gte: now } },
                { isComingSoon: true },
            ],
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
            delete query.$or;
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
}
exports.default = PublicEventService;
