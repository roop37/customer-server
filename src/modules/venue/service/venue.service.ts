import { ErrorWithProps } from "mercurius";
import { Types } from "mongoose";
import { VenueHostModel } from "../schema/venue.schema";
import { PublicVenueFilterInput } from "../interfaces/venue.input";
import {
  PublicVenue,
  PublicVenuePaginatedResponse,
} from "../interfaces/venue.objects";

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Only admin-verified, active, non-deleted venues are publicly listable.
// Mirrors the visibility gate the event module applies before exposing a
// host. `isDeleted: { $ne: true }` (not `false`) so a legacy doc missing
// the field still surfaces.
const PUBLIC_VENUE_FILTER = {
  isAdminVerified: true,
  isActive: true,
  isDeleted: { $ne: true },
} as const;

// Public-safe projection — never select email / phone / GSTIN / owner.
const PUBLIC_VENUE_PROJECTION = {
  name: 1,
  logo: 1,
  description: 1,
  venueType: 1,
  address: 1,
  websiteUrl: 1,
  gallery: 1,
} as const;

const toPublicVenue = (row: any): PublicVenue => ({
  _id: String(row._id),
  name: row.name ?? undefined,
  logo: row.logo ?? undefined,
  description: row.description ?? undefined,
  venueType: row.venueType ?? undefined,
  address: row.address ?? undefined,
  websiteUrl: row.websiteUrl ?? undefined,
  // Cap at 5 images on read as well as write, so a stale over-long array
  // can't blow up the public page.
  gallery: Array.isArray(row.gallery) ? row.gallery.slice(0, 5) : undefined,
});

class PublicVenueService {
  async getPublicVenues(
    input: PublicVenueFilterInput
  ): Promise<PublicVenuePaginatedResponse> {
    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 20));

    const query: Record<string, any> = { ...PUBLIC_VENUE_FILTER };

    if (input.search?.trim()) {
      query.name = { $regex: escapeRegex(input.search.trim()), $options: "i" };
    }
    if (input.venueType?.trim()) {
      query.venueType = new RegExp(
        `^${escapeRegex(input.venueType.trim())}$`,
        "i"
      );
    }
    if (input.city?.trim()) {
      query["address.city"] = new RegExp(
        `^${escapeRegex(input.city.trim())}$`,
        "i"
      );
    }

    const [rows, total] = await Promise.all([
      VenueHostModel.find(query, PUBLIC_VENUE_PROJECTION)
        .sort({ name: 1, createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      VenueHostModel.countDocuments(query),
    ]);

    return { venues: rows.map(toPublicVenue), total, page, pageSize };
  }

  async getPublicVenueById(id: string): Promise<PublicVenue | null> {
    if (!id) throw new ErrorWithProps("Venue ID is required");
    if (!Types.ObjectId.isValid(id)) return null;

    const row = await VenueHostModel.findOne(
      { _id: id, ...PUBLIC_VENUE_FILTER },
      PUBLIC_VENUE_PROJECTION
    ).lean();

    return row ? toPublicVenue(row) : null;
  }
}

export default PublicVenueService;
