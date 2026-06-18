import {
  EventStatus,
  GuestlistContributorType,
  GuestlistEntryStatus,
} from "@hoizr-technology/shared";
import { ErrorWithProps } from "mercurius";
import { generateGuestlistQrPayload } from "../../../utils/guestlist-qr";
import { enqueueLifecycleEmail } from "../../../utils/lifecycle.queue";
import { CustomerModel } from "../../customer/schema/customer.schema";
import { EventModel } from "../../event/schema/event.schema";
import { VenueHostModel } from "../../venue/schema/venue.schema";
import {
  GuestlistJoinView,
  GuestlistTicketView,
  PublicGuestlistView,
  VenuePublicGuestlistView,
} from "../interfaces/guestlist.objects";
import {
  GuestlistEntryModel,
  GuestlistModel,
} from "../schema/guestlist.schema";

const ACTIVE_STATUSES = [
  GuestlistEntryStatus.ACCEPTED,
  GuestlistEntryStatus.PENDING,
];

class GuestlistService {
  private venueOf(event: any): string | undefined {
    return (
      event?.location?.place?.displayName ||
      event?.location?.addressLine1 ||
      event?.city ||
      undefined
    );
  }

  private toTicketView(
    entry: any,
    event: any,
    config: any
  ): GuestlistTicketView {
    return {
      entryId: String(entry._id),
      eventId: String(entry.eventId),
      eventTitle: event?.title,
      eventFlyer: event?.eventFlyer ?? undefined,
      eventDate: event?.startDate
        ? new Date(event.startDate).toISOString()
        : undefined,
      venue: this.venueOf(event),
      contributorName: config?.contributorName ?? undefined,
      status: entry.status,
      qrCodeData: entry.qrCodeData ?? undefined,
      checkedIn: !!entry.checkedIn,
    };
  }

  /** Public guestlists for an event — shown on the event page when a host or
   *  artist opts their list in (isPublic). Private lists are join-by-link only. */
  async getPublicGuestlists(eventId: string): Promise<PublicGuestlistView[]> {
    if (!eventId) return [];
    const event = await EventModel.findById(eventId)
      .select("guestlistEnabled hostId")
      .lean<any>();
    if (!event || !event.guestlistEnabled) return [];

    // The public guestlist view is disabled while the host is still onboarding.
    // Same gate the venue module uses (onboardingCompleted + active). The
    // private join-by-link path (getGuestlistByCode) is intentionally NOT gated
    // — a shared invite link still works during onboarding.
    const host = await VenueHostModel.findOne({
      _id: event.hostId,
      onboardingCompleted: true,
      isActive: true,
      isDeleted: { $ne: true },
    })
      .select("_id")
      .lean<any>();
    if (!host) return [];

    const lists = await GuestlistModel.find({
      eventId,
      isPublic: true,
      isActive: true,
    })
      .sort({ createdAt: 1 })
      .lean<any[]>();
    if (!lists.length) return [];

    const ids = lists.map((l) => String(l._id));
    const counts = await GuestlistEntryModel.aggregate([
      { $match: { guestlistId: { $in: ids }, status: { $in: ACTIVE_STATUSES } } },
      { $group: { _id: "$guestlistId", n: { $sum: 1 } } },
    ]);
    const countMap = new Map<string, number>(
      counts.map((c: any) => [String(c._id), c.n])
    );

    return lists.map((l) => ({
      guestlistId: String(l._id),
      code: l.code,
      contributorName: l.contributorName ?? undefined,
      contributorType: l.contributorType,
      isFull: l.cap != null && (countMap.get(String(l._id)) ?? 0) >= l.cap,
    }));
  }

  /**
   * A host's PUBLIC guestlists across their upcoming published events — shown
   * on the host/venue detail page (the other entry point besides the shared
   * link). Same onboarding gate as the public event view: nothing surfaces for
   * a host still onboarding. Scoped to the host's OWN lists (contributorType
   * HOST) — collaborator/artist lists stay on their own surfaces.
   */
  async getVenuePublicGuestlists(
    hostId: string
  ): Promise<VenuePublicGuestlistView[]> {
    if (!hostId) return [];

    const host = await VenueHostModel.findOne({
      _id: hostId,
      onboardingCompleted: true,
      isActive: true,
      isDeleted: { $ne: true },
    })
      .select("_id")
      .lean<any>();
    if (!host) return [];

    const now = new Date();
    const events = await EventModel.find({
      hostId,
      isDeleted: false,
      guestlistEnabled: true,
      status: EventStatus.PUBLISHED,
      $or: [{ endDate: { $gte: now } }, { startDate: { $gte: now } }],
    })
      .select("title eventFlyer startDate")
      .sort({ startDate: 1 })
      .lean<any[]>();
    if (!events.length) return [];

    const eventMap = new Map(events.map((e) => [String(e._id), e]));
    const lists = await GuestlistModel.find({
      eventId: { $in: events.map((e) => String(e._id)) },
      contributorType: GuestlistContributorType.HOST,
      isPublic: true,
      isActive: true,
    })
      .sort({ createdAt: 1 })
      .lean<any[]>();
    if (!lists.length) return [];

    const ids = lists.map((l) => String(l._id));
    const counts = await GuestlistEntryModel.aggregate([
      { $match: { guestlistId: { $in: ids }, status: { $in: ACTIVE_STATUSES } } },
      { $group: { _id: "$guestlistId", n: { $sum: 1 } } },
    ]);
    const countMap = new Map<string, number>(
      counts.map((c: any) => [String(c._id), c.n])
    );

    return lists.map((l) => {
      const ev = eventMap.get(String(l.eventId));
      return {
        guestlistId: String(l._id),
        code: l.code,
        contributorName: l.contributorName ?? undefined,
        isFull: l.cap != null && (countMap.get(String(l._id)) ?? 0) >= l.cap,
        eventId: String(l.eventId),
        eventTitle: ev?.title,
        eventFlyer: ev?.eventFlyer ?? undefined,
        eventDate: ev?.startDate
          ? new Date(ev.startDate).toISOString()
          : undefined,
      };
    });
  }

  /** Join-link landing — what the customer sees before joining. */
  async getGuestlistByCode(
    code: string,
    customerId?: string
  ): Promise<GuestlistJoinView> {
    const config = await GuestlistModel.findOne({ code, isActive: true }).lean<any>();
    if (!config) {
      throw new ErrorWithProps("This guestlist link is no longer active.");
    }
    const event = await EventModel.findById(config.eventId)
      .select("title eventFlyer startDate city location guestlistEnabled")
      .lean<any>();
    if (!event || !event.guestlistEnabled) {
      throw new ErrorWithProps("The guestlist isn't open for this event.");
    }

    const activeCount = await GuestlistEntryModel.countDocuments({
      guestlistId: config._id,
      status: { $in: ACTIVE_STATUSES },
    });

    let alreadyJoined = false;
    let myEntryStatus: GuestlistEntryStatus | undefined;
    if (customerId) {
      const mine = await GuestlistEntryModel.findOne({
        guestlistId: config._id,
        customerId,
      })
        .select("status")
        .lean<any>();
      if (mine) {
        alreadyJoined = true;
        myEntryStatus = mine.status;
      }
    }

    return {
      guestlistId: String(config._id),
      code: config.code,
      eventId: String(config.eventId),
      eventTitle: event.title,
      eventFlyer: event.eventFlyer ?? undefined,
      eventDate: event.startDate
        ? new Date(event.startDate).toISOString()
        : undefined,
      city: event.city ?? undefined,
      contributorName: config.contributorName ?? undefined,
      isPublic: !!config.isPublic,
      isFull: config.cap != null && activeCount >= config.cap,
      alreadyJoined,
      myEntryStatus,
    };
  }

  /** Logged-in customer joins a guestlist by code. Idempotent per list. */
  async joinGuestlist(
    code: string,
    customerId: string
  ): Promise<GuestlistTicketView> {
    const config = await GuestlistModel.findOne({ code, isActive: true }).lean<any>();
    if (!config) {
      throw new ErrorWithProps("This guestlist link is no longer active.");
    }
    const event = await EventModel.findById(config.eventId)
      .select(
        "title eventFlyer startDate endDate status city location guestlistEnabled guestlistAutoAccept"
      )
      .lean<any>();
    if (!event || !event.guestlistEnabled) {
      throw new ErrorWithProps("The guestlist isn't open for this event.");
    }
    if (event.status === EventStatus.CANCELLED) {
      throw new ErrorWithProps("This event was cancelled.");
    }
    // Block joins once the event has ended (status flipped to Completed by the
    // cron, or endDate already passed) — mirrors the cart's end-date guard.
    if (
      event.status === EventStatus.COMPLETED ||
      (event.endDate && new Date(event.endDate).getTime() < Date.now())
    ) {
      throw new ErrorWithProps("This event has already ended.");
    }
    if (event.startDate && new Date(event.startDate).getTime() < Date.now()) {
      throw new ErrorWithProps("This event has already started.");
    }

    // Already on this list? Return it (idempotent), unless revoked.
    const existing = await GuestlistEntryModel.findOne({
      guestlistId: config._id,
      customerId,
    }).lean<any>();
    if (existing) {
      if (existing.status === GuestlistEntryStatus.REVOKED) {
        throw new ErrorWithProps("Your guestlist access was revoked.");
      }
      return this.toTicketView(existing, event, config);
    }

    if (config.cap != null) {
      const count = await GuestlistEntryModel.countDocuments({
        guestlistId: config._id,
        status: { $in: ACTIVE_STATUSES },
      });
      if (count >= config.cap) {
        throw new ErrorWithProps("This guestlist is full.");
      }
    }

    const customer = await CustomerModel.findById(customerId)
      .select("firstName lastName email phone")
      .lean<any>();

    const status =
      event.guestlistAutoAccept === false
        ? GuestlistEntryStatus.PENDING
        : GuestlistEntryStatus.ACCEPTED;

    const entry = new GuestlistEntryModel({
      guestlistId: String(config._id),
      eventId: String(config.eventId),
      customerId,
      guestName:
        [customer?.firstName, customer?.lastName].filter(Boolean).join(" ") ||
        undefined,
      guestEmail: customer?.email,
      guestPhone: customer?.phone,
      status,
    });
    if (status === GuestlistEntryStatus.ACCEPTED) {
      const qr = generateGuestlistQrPayload(entry._id.toString(), config.code);
      entry.qrCodeData = qr.payload;
      entry.qrCodeHash = qr.hash;
      entry.qrHashVersion = qr.version;
    }

    try {
      await entry.save();
    } catch (e: any) {
      // Unique {guestlistId, customerId} race → fetch the winner.
      if (e?.code === 11000) {
        const again = await GuestlistEntryModel.findOne({
          guestlistId: config._id,
          customerId,
        }).lean<any>();
        if (again) return this.toTicketView(again, event, config);
      }
      throw e;
    }

    // Auto-accepted → confirm by email. (Approval-mode joins are emailed
    // when the organizer approves, from main-server.) Best-effort.
    if (status === GuestlistEntryStatus.ACCEPTED && customer?.email) {
      try {
        await enqueueLifecycleEmail(
          "GUESTLIST_ACCEPTED" as any,
          customer.email,
          entry.guestName ?? undefined,
          { eventTitle: event.title ?? "" }
        );
      } catch {
        // non-fatal
      }
    }

    return this.toTicketView(entry.toObject(), event, config);
  }

  /** The customer's golden tickets (excludes revoked). */
  async getMyGuestlistEntries(
    customerId: string
  ): Promise<GuestlistTicketView[]> {
    const entries = await GuestlistEntryModel.find({
      customerId,
      status: { $ne: GuestlistEntryStatus.REVOKED },
    })
      .sort({ createdAt: -1 })
      .lean<any[]>();
    if (!entries.length) return [];

    const eventIds = [...new Set(entries.map((e) => String(e.eventId)))];
    const guestlistIds = [...new Set(entries.map((e) => String(e.guestlistId)))];
    const [events, configs] = await Promise.all([
      EventModel.find({ _id: { $in: eventIds } })
        .select("title eventFlyer startDate city location")
        .lean<any[]>(),
      GuestlistModel.find({ _id: { $in: guestlistIds } })
        .select("contributorName code")
        .lean<any[]>(),
    ]);
    const eventMap = new Map(events.map((e) => [String(e._id), e]));
    const configMap = new Map(configs.map((c) => [String(c._id), c]));

    // Lazy QR issuance: an entry approved in approval-mode is ACCEPTED but has
    // no QR yet (signing lives only here). Mint + persist on first view so the
    // golden ticket is always scannable.
    const updates: Promise<unknown>[] = [];
    for (const e of entries) {
      if (e.status === GuestlistEntryStatus.ACCEPTED && !e.qrCodeData) {
        const cfg = configMap.get(String(e.guestlistId));
        if (cfg?.code) {
          const qr = generateGuestlistQrPayload(String(e._id), cfg.code);
          e.qrCodeData = qr.payload;
          e.qrCodeHash = qr.hash;
          e.qrHashVersion = qr.version;
          updates.push(
            GuestlistEntryModel.updateOne(
              { _id: e._id, qrCodeData: { $in: [null, undefined] } },
              {
                $set: {
                  qrCodeData: qr.payload,
                  qrCodeHash: qr.hash,
                  qrHashVersion: qr.version,
                },
              }
            )
          );
        }
      }
    }
    if (updates.length) await Promise.all(updates);

    return entries.map((e) =>
      this.toTicketView(
        e,
        eventMap.get(String(e.eventId)),
        configMap.get(String(e.guestlistId))
      )
    );
  }
}

export const guestlistService = new GuestlistService();
export default GuestlistService;
