import { Event, EventStatus } from "@hoizr-technology/shared";
import { ErrorWithProps } from "mercurius";
import { Types } from "mongoose";
import { ArtistModel } from "../../artistFollow/schema/artist-follow.schema";
import {
  EventModel,
  HostModel,
  PhantomArtistModel,
} from "../schema/event.schema";
import { PublicEventFilterInput } from "../interfaces/event.input";
import {
  PublicArtistOrOrganizerEvents,
  PublicEventArtistEntry,
  PublicEventOrganizerEntry,
  PublicEventPaginatedResponse,
  PublicEventPeopleResponse,
  PublicEventSummary,
} from "../interfaces/event.objects";

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

class PublicEventService {
  async getEventBySlug(slug: string): Promise<Event | null> {
    if (!slug) throw new ErrorWithProps("Slug is required");

    const visibilityFilter = {
      isDeleted: false,
      isVisible: true,
      // AUDIT-065: completed events must still RENDER (detail pages, past-event
      // buckets) — only PURCHASE gates (cart/order) stay PUBLISHED-only.
      status: { $in: [EventStatus.PUBLISHED, EventStatus.COMPLETED] },
      adminPaused: { $ne: true },
    } as const;

    const event = await EventModel.findOne({
      slug,
      ...visibilityFilter,
    }).lean<Event>();
    if (event) return event;

    // ID fallback. Older campaigns + hand-pasted host ctaLinks sometimes
    // produce /events/<ObjectId> URLs even though the canonical SEO URL
    // is /events/<slug>. Recognise a 24-char hex ObjectId and fall back
    // to findById with the same visibility gates so the email link is
    // never a 404 just because the surrounding code used the wrong id.
    if (Types.ObjectId.isValid(slug) && /^[a-f0-9]{24}$/i.test(slug)) {
      const byId = await EventModel.findOne({
        _id: slug,
        ...visibilityFilter,
      }).lean<Event>();
      if (byId) return byId;
    }

    return null;
  }

  async getEventById(id: string): Promise<Event | null> {
    if (!id) throw new ErrorWithProps("Event ID is required");

    const event = await EventModel.findOne({
      _id: id,
      isDeleted: false,
      isVisible: true,
      // AUDIT-065: completed events must still RENDER (detail pages, past-event
      // buckets) — only PURCHASE gates (cart/order) stay PUBLISHED-only.
      status: { $in: [EventStatus.PUBLISHED, EventStatus.COMPLETED] },
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
    };
    // Conditions ANDed together (date window + free-text search) — kept in
    // one array so they never collide with each other's $or.
    const and: Record<string, any>[] = [];

    // City filter — a multi-city event must surface under ANY of its cities.
    // Per-day venues store only a city string (AddressInfo has no cityId), so
    // the cityId path matches the event's top-level city, and the city-name
    // path additionally matches any per-day venue city.
    if (input.cityId) {
      query.cityId = input.cityId;
    } else if (input.city) {
      const cityRx = new RegExp(`^${escapeRegex(input.city)}$`, "i");
      and.push({
        $or: [{ city: cityRx }, { "days.location.city": cityRx }],
      });
    }

    if (input.eventCategoryIds?.length) {
      query.eventCategoryId = { $in: input.eventCategoryIds };
    }
    if (input.genreTagIds?.length) {
      query.genreTagIds = { $in: input.genreTagIds };
    }

    if (input.startDateFrom || input.startDateTo) {
      // Explicit user date-range filter overrides the default window.
      const range: Record<string, any> = {
        $gte:
          input.startDateFrom && input.startDateFrom > now
            ? input.startDateFrom
            : now,
      };
      if (input.startDateTo) range.$lte = input.startDateTo;
      query.startDate = range;
    } else {
      // Default window: keep an event in the listing until it ENDS, not
      // until it starts — an ongoing / multi-day event (started but not
      // finished) must stay visible and bookable. Fall back to startDate
      // when the event has no endDate.
      and.push({
        $or: [
          { endDate: { $gte: now } },
          { endDate: null, startDate: { $gte: now } },
          { endDate: { $exists: false }, startDate: { $gte: now } },
        ],
      });
    }

    if (input.search) {
      const term = input.search.trim();
      if (term) {
        const safeTerm = escapeRegex(term);
        and.push({
          $or: [
            { title: { $regex: safeTerm, $options: "i" } },
            { description: { $regex: safeTerm, $options: "i" } },
          ],
        });
      }
    }

    if (and.length) query.$and = and;

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

  /**
   * People associated with an event: the lineup (real Artist rows or
   * PhantomArtist stand-ins), the organizer (event.hostId → Host) and
   * collaborators (event.eventCollaborationBusiness[].businessLinkId →
   * Host). One query for the customer event detail page so the UI
   * doesn't need to fan out client-side.
   */
  async getEventPeople(eventId: string): Promise<PublicEventPeopleResponse> {
    if (!eventId) throw new ErrorWithProps("Event ID is required");

    const event = await EventModel.findOne({
      _id: eventId,
      isDeleted: false,
      isVisible: true,
      // AUDIT-065: completed events must still RENDER (detail pages, past-event
      // buckets) — only PURCHASE gates (cart/order) stay PUBLISHED-only.
      status: { $in: [EventStatus.PUBLISHED, EventStatus.COMPLETED] },
      adminPaused: { $ne: true },
    }).lean<Event>();

    if (!event) return { artists: [], organizers: [] };

    // ---------- Artists --------------------------------------------------
    // Rejected lineup artists are removed from the public event page.
    // (null status == accepted; only an explicit "REJECTED" hides them.)
    const lineup = (event.lineup ?? [])
      .filter(Boolean)
      .filter((l: any) => l?.status !== "REJECTED");
    const artistLinkIds = lineup
      .map((l) => l.artistLinkId)
      .filter((id): id is string => Boolean(id) && Types.ObjectId.isValid(id));
    const phantomIds = lineup
      .map((l) => l.tempArtistId)
      .filter((id): id is string => Boolean(id) && Types.ObjectId.isValid(id));

    const [artistRows, phantomRows] = await Promise.all([
      artistLinkIds.length
        ? ArtistModel.find({
            _id: { $in: artistLinkIds },
            isDeleted: false,
          }).lean()
        : Promise.resolve([] as any[]),
      phantomIds.length
        ? PhantomArtistModel.find({
            _id: { $in: phantomIds },
            isDeleted: false,
          }).lean()
        : Promise.resolve([] as any[]),
    ]);

    const artistById = new Map<string, any>(
      artistRows.map((row: any) => [String(row._id), row])
    );
    const phantomById = new Map<string, any>(
      phantomRows.map((row: any) => [String(row._id), row])
    );

    // Preserve lineup order so the "headliner first" intent the host
    // expressed when arranging the line-up is what the customer sees.
    const artists: PublicEventArtistEntry[] = lineup.map((entry) => {
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
    const collaborators = (event.eventCollaborationBusiness ?? []).filter(
      (c) => !c.hideOnEventPage
    );
    const collabBusinessIds = collaborators
      .map((c) => c.businessLinkId)
      .filter((id): id is string => Boolean(id) && Types.ObjectId.isValid(id));

    const allHostIds = [event.hostId, ...collabBusinessIds]
      .filter((id): id is string => Boolean(id) && Types.ObjectId.isValid(id));

    const hostRows = allHostIds.length
      ? await HostModel.find({
          _id: { $in: allHostIds },
        }).lean()
      : [];

    const hostById = new Map<string, any>(
      hostRows.map((row: any) => [String(row._id), row])
    );

    const organizers: PublicEventOrganizerEntry[] = [];
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
        logo: host?.logo ?? host?.brandingLogo ?? (collab as any).logo ?? undefined,
        description: host?.description ?? undefined,
        city: host?.address?.city ?? undefined,
        isPrimary: false,
      });
    }

    return { artists, organizers };
  }

  /**
   * Public events linked to an artist via the lineup. Split into
   * upcoming/past around `now`. Used by the lineup card mini-profile
   * modal so the customer can scan what else this artist is on.
   * Visibility gated like every other public query (published, not
   * deleted, not admin-paused).
   */
  async getArtistPastUpcomingEvents(
    artistId: string,
    limitPerBucket = 6
  ): Promise<PublicArtistOrOrganizerEvents> {
    if (!artistId || !Types.ObjectId.isValid(artistId)) {
      return { upcoming: [], past: [] };
    }
    const now = new Date();
    const baseFilter = {
      isDeleted: false,
      isVisible: true,
      // AUDIT-065: completed events must still RENDER (detail pages, past-event
      // buckets) — only PURCHASE gates (cart/order) stay PUBLISHED-only.
      status: { $in: [EventStatus.PUBLISHED, EventStatus.COMPLETED] },
      adminPaused: { $ne: true },
      // Match either a real Artist (lineup.artistLinkId) or a phantom
      // (lineup.tempArtistId) so the modal works for both kinds.
      $or: [
        { "lineup.artistLinkId": artistId },
        { "lineup.tempArtistId": artistId },
      ],
    };

    const projection = {
      title: 1,
      slug: 1,
      eventFlyer: 1,
      horizontalFlyer: 1,
      city: 1,
      startDate: 1,
    } as const;

    const [upcoming, past] = await Promise.all([
      EventModel.find(
        {
          ...baseFilter,
          // "Upcoming" = not yet ended (ongoing events count as upcoming).
          $and: [
            {
              $or: [
                { endDate: { $gte: now } },
                { endDate: null, startDate: { $gte: now } },
                { endDate: { $exists: false }, startDate: { $gte: now } },
              ],
            },
          ],
        },
        projection
      )
        .sort({ startDate: 1 })
        .limit(limitPerBucket)
        .lean<PublicEventSummary[]>(),
      EventModel.find(
        {
          ...baseFilter,
          // "Past" = already ended.
          $and: [
            {
              $or: [
                { endDate: { $lt: now } },
                { endDate: null, startDate: { $lt: now } },
                { endDate: { $exists: false }, startDate: { $lt: now } },
              ],
            },
          ],
        },
        projection
      )
        .sort({ startDate: -1 })
        .limit(limitPerBucket)
        .lean<PublicEventSummary[]>(),
    ]);

    return { upcoming, past };
  }

  /**
   * Public events linked to a host as primary organiser OR as a
   * collaborator. Same shape + visibility gates as the artist version.
   */
  async getOrganizerPastUpcomingEvents(
    hostId: string,
    limitPerBucket = 6
  ): Promise<PublicArtistOrOrganizerEvents> {
    if (!hostId || !Types.ObjectId.isValid(hostId)) {
      return { upcoming: [], past: [] };
    }
    const now = new Date();
    const baseFilter = {
      isDeleted: false,
      isVisible: true,
      // AUDIT-065: completed events must still RENDER (detail pages, past-event
      // buckets) — only PURCHASE gates (cart/order) stay PUBLISHED-only.
      status: { $in: [EventStatus.PUBLISHED, EventStatus.COMPLETED] },
      adminPaused: { $ne: true },
      $or: [
        { hostId },
        { "eventCollaborationBusiness.businessLinkId": hostId },
      ],
    };

    const projection = {
      title: 1,
      slug: 1,
      eventFlyer: 1,
      horizontalFlyer: 1,
      city: 1,
      startDate: 1,
    } as const;

    const [upcoming, past] = await Promise.all([
      EventModel.find(
        {
          ...baseFilter,
          // "Upcoming" = not yet ended (ongoing events count as upcoming).
          $and: [
            {
              $or: [
                { endDate: { $gte: now } },
                { endDate: null, startDate: { $gte: now } },
                { endDate: { $exists: false }, startDate: { $gte: now } },
              ],
            },
          ],
        },
        projection
      )
        .sort({ startDate: 1 })
        .limit(limitPerBucket)
        .lean<PublicEventSummary[]>(),
      EventModel.find(
        {
          ...baseFilter,
          // "Past" = already ended.
          $and: [
            {
              $or: [
                { endDate: { $lt: now } },
                { endDate: null, startDate: { $lt: now } },
                { endDate: { $exists: false }, startDate: { $lt: now } },
              ],
            },
          ],
        },
        projection
      )
        .sort({ startDate: -1 })
        .limit(limitPerBucket)
        .lean<PublicEventSummary[]>(),
    ]);

    return { upcoming, past };
  }
}

export default PublicEventService;
