import { Event, EventStatus } from "@hoizr-technology/shared";
import { ErrorWithProps } from "mercurius";
import { EventModel } from "../schema/event.schema";
import { PublicEventFilterInput } from "../interfaces/event.input";
import { PublicEventPaginatedResponse } from "../interfaces/event.objects";

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

class PublicEventService {
  async getEventBySlug(slug: string): Promise<Event | null> {
    if (!slug) throw new ErrorWithProps("Slug is required");

    const event = await EventModel.findOne({
      slug,
      isDeleted: false,
      isVisible: true,
      status: EventStatus.PUBLISHED,
      adminPaused: { $ne: true },
    }).lean<Event>();

    return event ?? null;
  }

  async getEventById(id: string): Promise<Event | null> {
    if (!id) throw new ErrorWithProps("Event ID is required");

    const event = await EventModel.findOne({
      _id: id,
      isDeleted: false,
      isVisible: true,
      status: EventStatus.PUBLISHED,
      adminPaused: { $ne: true },
    }).lean<Event>();

    return event ?? null;
  }

  async getPublishedEvents(
    input: PublicEventFilterInput
  ): Promise<PublicEventPaginatedResponse> {
    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 20));
    const now = new Date();

    const query: Record<string, any> = {
      status: EventStatus.PUBLISHED,
      isDeleted: false,
      isVisible: true,
      adminPaused: { $ne: true },
      $or: [
        { startDate: { $gte: now } },
        { endDate: { $gte: now } },
        { isComingSoon: true },
      ],
    };

    if (input.cityId) query.cityId = input.cityId;
    else if (input.city) query.city = new RegExp(`^${escapeRegex(input.city)}$`, "i");

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
      } else {
        query.startDate.$gte = now;
      }
      if (input.startDateTo) query.startDate.$lte = input.startDateTo;
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
      EventModel.find(query)
        .sort({ isHighDemand: -1, startDate: 1, createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean<Event[]>(),
      EventModel.countDocuments(query),
    ]);

    let filtered = events;
    if (input.minPrice !== undefined || input.maxPrice !== undefined) {
      filtered = events.filter((event) => {
        const prices = (event.tickets ?? [])
          .filter((t) => (t.ticketVisible ?? true) && !t.markAsComingSoon)
          .map((t) => Number(t.ticketPrice ?? 0));
        if (!prices.length) return false;
        const min = Math.min(...prices);
        if (input.minPrice !== undefined && min < input.minPrice) return false;
        if (input.maxPrice !== undefined && min > input.maxPrice) return false;
        return true;
      });
    }

    return { events: filtered, total, page, pageSize };
  }
}

export default PublicEventService;
