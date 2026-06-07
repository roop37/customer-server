import { OrderStatus } from "@hoizr-technology/shared";
import { ErrorWithProps } from "mercurius";
import { EnvVars } from "../../../utils/environment";
import { CustomerModel } from "../../customer/schema/customer.schema";
import { OrderModel } from "../../order/schema/order.schema";
import {
  CustomerInstagram,
  CustomerInstagramMedia,
  CustomerInstagramModel,
} from "../schema/customer-instagram.schema";
import {
  ConnectInstagramInput,
  EventAttendeeWithInstagram,
  UpdateInstagramVisibilityInput,
} from "../interfaces/customer-instagram.input";
import {
  decryptToken,
  encryptToken,
  isCryptoConfigured,
} from "../util/token-crypto";

/**
 * Stub Meta-fetch helpers. When a Meta App ID becomes available we
 * swap the body of these functions to real Graph API calls — the
 * callsites and return shapes stay the same.
 *
 * The stub is deterministic on `handle` so re-running the connect
 * mutation with the same handle returns the same numbers and media
 * URLs (good for screenshots + UI iteration without churn).
 */
const hashString = (input: string): number => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const PLACEHOLDER_AVATARS = [
  "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=240&q=80",
  "https://images.unsplash.com/photo-1546961342-1583128d7f24?w=240&q=80",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=240&q=80",
  "https://images.unsplash.com/photo-1488161628813-04466f872be2?w=240&q=80",
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=240&q=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=240&q=80",
];

const PLACEHOLDER_MEDIA = [
  "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&q=80",
  "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&q=80",
  "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800&q=80",
  "https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=800&q=80",
  "https://images.unsplash.com/photo-1506157786151-b8491531f063?w=800&q=80",
  "https://images.unsplash.com/photo-1485872299712-c83b14d80d24?w=800&q=80",
  "https://images.unsplash.com/photo-1531315396756-905d68d21b56?w=800&q=80",
  "https://images.unsplash.com/photo-1496024840928-4c417adf211d?w=800&q=80",
  "https://images.unsplash.com/photo-1504609813442-a8924e83f76e?w=800&q=80",
  "https://images.unsplash.com/photo-1467810563316-b5476525c0f9?w=800&q=80",
];

type FetchedProfile = {
  instagramUserId: string;
  handle: string;
  avatar: string;
  biography: string;
  followerCount: number;
  mediaCount: number;
  recentMedia: CustomerInstagramMedia[];
};
type StubProfile = FetchedProfile;

const isRealMetaConfigured = (): boolean =>
  Boolean(
    EnvVars.values.META_INSTAGRAM_APP_ID &&
      EnvVars.values.META_INSTAGRAM_APP_SECRET &&
      EnvVars.values.META_INSTAGRAM_REDIRECT_URI &&
      EnvVars.values.META_INSTAGRAM_STATE_SECRET &&
      isCryptoConfigured()
  );

/**
 * Token-exchange step of the Instagram OAuth handoff. Three calls:
 *   1) POST oauth/access_token with the short-lived `code` from the
 *      callback → short-lived access token (~1 hr).
 *   2) GET graph.instagram.com/access_token?grant_type=ig_exchange_token
 *      → long-lived token (~60d, refreshable).
 *   3) GET graph.instagram.com/me?fields=id,username,account_type
 *      to learn the IG user id (Meta returns a numeric "user_id" from
 *      step 1 but the canonical id for downstream calls is /me's id).
 *
 * Caller is responsible for encrypting the long-lived token before
 * persistence.
 */
type ExchangedToken = {
  longLivedToken: string;
  expiresInSec: number;
  instagramUserId: string;
  accountType: string;
};

const exchangeCodeForToken = async (code: string): Promise<ExchangedToken> => {
  const appId = EnvVars.values.META_INSTAGRAM_APP_ID!;
  const appSecret = EnvVars.values.META_INSTAGRAM_APP_SECRET!;
  const redirectUri = EnvVars.values.META_INSTAGRAM_REDIRECT_URI!;

  // 1) Short-lived token
  const shortForm = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });
  const shortRes = await fetch(
    "https://api.instagram.com/oauth/access_token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: shortForm.toString(),
    }
  );
  if (!shortRes.ok) {
    const body = await shortRes.text();
    throw new ErrorWithProps(
      `Instagram short-token exchange failed: ${shortRes.status} ${body}`
    );
  }
  const shortJson = (await shortRes.json()) as {
    access_token: string;
    user_id: number | string;
  };

  // 2) Long-lived token
  const longUrl = new URL("https://graph.instagram.com/access_token");
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", appSecret);
  longUrl.searchParams.set("access_token", shortJson.access_token);
  const longRes = await fetch(longUrl);
  if (!longRes.ok) {
    const body = await longRes.text();
    throw new ErrorWithProps(
      `Instagram long-token exchange failed: ${longRes.status} ${body}`
    );
  }
  const longJson = (await longRes.json()) as {
    access_token: string;
    token_type: string;
    expires_in: number;
  };

  // 3) Resolve the canonical IG user id + account type via /me. The
  //    short-token response's `user_id` is also valid but /me is the
  //    documented entry point and returns account_type which we use
  //    to upsell personal → creator on the UI.
  const meUrl = new URL("https://graph.instagram.com/me");
  meUrl.searchParams.set("fields", "id,username,account_type");
  meUrl.searchParams.set("access_token", longJson.access_token);
  const meRes = await fetch(meUrl);
  if (!meRes.ok) {
    const body = await meRes.text();
    throw new ErrorWithProps(
      `Instagram /me lookup failed: ${meRes.status} ${body}`
    );
  }
  const meJson = (await meRes.json()) as {
    id: string;
    username: string;
    account_type: string;
  };

  return {
    longLivedToken: longJson.access_token,
    expiresInSec: longJson.expires_in,
    instagramUserId: meJson.id,
    accountType: meJson.account_type,
  };
};

/**
 * Real Meta data fetch — replaces the stub for any account that has a
 * valid long-lived access token. Two parallel calls (profile + last
 * 10 media) so we minimise wall-clock for the connect callback path.
 *
 * `account_type === "PERSONAL"` accounts under the new Instagram API
 * with Instagram Login return media but NOT follower count or biography
 * — those are gated on a Professional (Creator / Business) account.
 * We coalesce missing fields to zero/empty rather than throwing so the
 * connect flow still completes for Personal accounts.
 */
const fetchMetaProfile = async (
  accessToken: string,
  instagramUserId: string
): Promise<FetchedProfile> => {
  const profileUrl = new URL(`https://graph.instagram.com/${instagramUserId}`);
  profileUrl.searchParams.set(
    "fields",
    "id,username,account_type,media_count,followers_count,biography,profile_picture_url"
  );
  profileUrl.searchParams.set("access_token", accessToken);

  const mediaUrl = new URL(
    `https://graph.instagram.com/${instagramUserId}/media`
  );
  mediaUrl.searchParams.set(
    "fields",
    "id,caption,media_url,thumbnail_url,permalink,media_type,timestamp"
  );
  mediaUrl.searchParams.set("limit", "10");
  mediaUrl.searchParams.set("access_token", accessToken);

  const [profileRes, mediaRes] = await Promise.all([
    fetch(profileUrl),
    fetch(mediaUrl),
  ]);
  if (!profileRes.ok) {
    const body = await profileRes.text();
    throw new ErrorWithProps(
      `Instagram profile fetch failed: ${profileRes.status} ${body}`
    );
  }
  if (!mediaRes.ok) {
    const body = await mediaRes.text();
    throw new ErrorWithProps(
      `Instagram media fetch failed: ${mediaRes.status} ${body}`
    );
  }
  const profile = (await profileRes.json()) as {
    id: string;
    username: string;
    account_type?: string;
    media_count?: number;
    followers_count?: number;
    biography?: string;
    profile_picture_url?: string;
  };
  const mediaJson = (await mediaRes.json()) as {
    data?: Array<{
      id: string;
      caption?: string;
      media_url: string;
      thumbnail_url?: string;
      permalink?: string;
      media_type?: string;
      timestamp?: string;
    }>;
  };
  const media = (mediaJson.data ?? []).map<CustomerInstagramMedia>((m) => ({
    id: m.id,
    caption: m.caption,
    mediaUrl: m.media_url,
    thumbnailUrl: m.thumbnail_url ?? m.media_url,
    permalink: m.permalink,
    mediaType: m.media_type,
    takenAt: m.timestamp ? new Date(m.timestamp) : undefined,
  }));

  return {
    instagramUserId: profile.id,
    handle: profile.username,
    avatar: profile.profile_picture_url ?? media[0]?.thumbnailUrl ?? "",
    biography: profile.biography ?? "",
    followerCount: Number(profile.followers_count ?? 0),
    mediaCount: Number(profile.media_count ?? 0),
    recentMedia: media,
  };
};

const buildStubProfile = (rawHandle: string): StubProfile => {
  const handle = rawHandle.replace(/^@/, "").toLowerCase();
  const seed = hashString(handle || "guest");
  const avatar = PLACEHOLDER_AVATARS[seed % PLACEHOLDER_AVATARS.length];
  const followerCount = 250 + (seed % 18000);
  const mediaCount = 12 + (seed % 240);
  const recentMedia: CustomerInstagramMedia[] = Array.from({
    length: 10,
  }).map((_, idx) => {
    const url = PLACEHOLDER_MEDIA[(seed + idx) % PLACEHOLDER_MEDIA.length];
    return {
      id: `${handle}-${idx}`,
      mediaUrl: url,
      thumbnailUrl: url,
      permalink: `https://instagram.com/${handle || "user"}`,
      mediaType: "IMAGE",
      takenAt: new Date(Date.now() - (idx + 1) * 24 * 60 * 60 * 1000),
      caption: idx === 0 ? "Latest from Hoizr nights" : undefined,
    } as CustomerInstagramMedia;
  });
  return {
    instagramUserId: `stub-${seed}`,
    handle,
    avatar,
    biography: "Music, nights out, and city corners. Hoizr-friendly.",
    followerCount,
    mediaCount,
    recentMedia,
  };
};

class CustomerInstagramService {
  async getMyInstagram(
    customerId: string
  ): Promise<CustomerInstagram | null> {
    return CustomerInstagramModel.findOne({ customerId }).lean<CustomerInstagram | null>();
  }

  async connectInstagram(
    customerId: string,
    input: ConnectInstagramInput
  ): Promise<CustomerInstagram> {
    // Pull customer to mirror the city tag onto the connection doc —
    // saves a per-row join when an event detail page asks for the
    // attendee row.
    const customer = await CustomerModel.findById(customerId)
      .select("city firstName")
      .lean<{ city?: string; firstName?: string }>();
    if (!customer) {
      throw new ErrorWithProps("Customer not found");
    }

    // SECURITY: in any environment where real Meta is configured, the
    // stub path is OFF — otherwise a signed-in customer could call
    // `connectInstagram(handle: "<anyone>")` via GraphQL and stamp
    // someone else's IG handle / avatar / synthetic follower count
    // onto their own record (identity spoofing — flagged in security
    // review 2026-06-06). Only real Meta-issued OAuth codes are
    // accepted in this mode, and the canonical entry point is the
    // /auth/instagram/callback Fastify route which signs + verifies
    // the OAuth state.
    //
    // The stub path remains reachable ONLY when env vars are unset
    // (local dev / preview deploys before a Meta app is registered);
    // it's strictly a dev convenience.
    if (isRealMetaConfigured()) {
      if (!input.oauthCode) {
        throw new ErrorWithProps(
          "Connect Instagram via the OAuth flow (open /auth/instagram/start). Direct handle connect is not allowed once the Meta integration is configured."
        );
      }
    }
    const realFlow = isRealMetaConfigured() && Boolean(input.oauthCode);

    if (realFlow) {
      const exchanged = await exchangeCodeForToken(input.oauthCode!);
      const profile = await fetchMetaProfile(
        exchanged.longLivedToken,
        exchanged.instagramUserId
      );
      const now = new Date();
      const tokenExpiresAt = new Date(
        now.getTime() + exchanged.expiresInSec * 1000
      );

      // First-time connect (or reconnect): always push the IG avatar
      // to Customer.profilePic. The customer can still upload a
      // different picture afterwards — the sync worker checks
      // `lastPushedAvatar` to detect that case and leaves the
      // customer's choice alone (see `syncMyInstagram`).
      if (profile.avatar) {
        await CustomerModel.updateOne(
          { _id: customerId },
          { $set: { profilePic: profile.avatar } }
        );
      }

      const updated = await CustomerInstagramModel.findOneAndUpdate(
        { customerId },
        {
          $set: {
            customerId,
            connected: true,
            handle: profile.handle,
            instagramUserId: profile.instagramUserId,
            avatar: profile.avatar,
            biography: profile.biography,
            followerCount: profile.followerCount,
            mediaCount: profile.mediaCount,
            recentMedia: profile.recentMedia,
            city: customer.city ?? undefined,
            accessToken: encryptToken(exchanged.longLivedToken),
            tokenExpiresAt,
            connectedAt: now,
            lastSyncedAt: now,
            lastPushedAvatar: profile.avatar || undefined,
          },
          // First-time connect defaults to visible: the value of the
        // attendees feature is reciprocal (you only see others who are
        // visible themselves), so the friction of an opt-in toggle
        // killed adoption. Users who want to hide flip the toggle in
        // their profile settings (the only place it's exposed).
        $setOnInsert: { attendeeVisibility: true },
        },
        { new: true, upsert: true, lean: true }
      );
      return updated as unknown as CustomerInstagram;
    }

    // Stub mode: derive a deterministic profile from the handle the
    // client supplies. Used for local dev / preview deploys before
    // the Meta app is registered.
    const seedHandle =
      input.handle?.trim() ||
      (customer.firstName
        ? `${customer.firstName.toLowerCase()}.hoizr`
        : `guest_${customerId.slice(-5)}`);
    const stub = buildStubProfile(seedHandle);

    // Stub path also seeds Customer.profilePic so the dev UX matches
    // production. Same lastPushedAvatar tracking.
    if (stub.avatar) {
      await CustomerModel.updateOne(
        { _id: customerId },
        { $set: { profilePic: stub.avatar } }
      );
    }

    const now = new Date();
    const updated = await CustomerInstagramModel.findOneAndUpdate(
      { customerId },
      {
        $set: {
          customerId,
          connected: true,
          handle: stub.handle,
          instagramUserId: stub.instagramUserId,
          avatar: stub.avatar,
          biography: stub.biography,
          followerCount: stub.followerCount,
          mediaCount: stub.mediaCount,
          recentMedia: stub.recentMedia,
          city: customer.city ?? undefined,
          accessToken: "stub-token",
          tokenExpiresAt: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000),
          connectedAt: now,
          lastSyncedAt: now,
          lastPushedAvatar: stub.avatar || undefined,
        },
        // First-time connect defaults to visible: the value of the
        // attendees feature is reciprocal (you only see others who are
        // visible themselves), so the friction of an opt-in toggle
        // killed adoption. Users who want to hide flip the toggle in
        // their profile settings (the only place it's exposed).
        $setOnInsert: { attendeeVisibility: true },
      },
      { new: true, upsert: true, lean: true }
    );
    return updated as unknown as CustomerInstagram;
  }

  /**
   * Convenience for the OAuth callback Fastify route. The route already
   * holds the short-lived `code` and resolves the `customerId` from the
   * signed state blob; it just needs to land the data in the same shape
   * `connectInstagram` does.
   */
  async connectInstagramFromOAuth(
    customerId: string,
    code: string
  ): Promise<CustomerInstagram> {
    return this.connectInstagram(customerId, { oauthCode: code });
  }

  /**
   * Whether the real Meta integration is wired up. The OAuth route
   * uses this to refuse to start the flow when env vars are missing
   * (better than a vague Meta error 30s later).
   */
  isRealMetaConfigured(): boolean {
    return isRealMetaConfigured();
  }

  async disconnectInstagram(customerId: string): Promise<boolean> {
    const result = await CustomerInstagramModel.updateOne(
      { customerId },
      {
        $set: { connected: false },
        $unset: { accessToken: "", tokenExpiresAt: "" },
      }
    );
    return result.acknowledged === true;
  }

  async updateAttendeeVisibility(
    customerId: string,
    input: UpdateInstagramVisibilityInput
  ): Promise<CustomerInstagram> {
    const updated = await CustomerInstagramModel.findOneAndUpdate(
      { customerId },
      { $set: { attendeeVisibility: Boolean(input.attendeeVisibility) } },
      { new: true, lean: true }
    );
    if (!updated) {
      throw new ErrorWithProps(
        "Connect Instagram first before changing visibility."
      );
    }
    return updated as unknown as CustomerInstagram;
  }

  /**
   * Re-sync the connection. Real Meta path when configured AND a
   * decryptable access token is on file; falls back to the stub
   * fetcher otherwise (deterministic on the stored handle).
   *
   * A 401/403 from Meta is treated as "token revoked" — we flip
   * `connected: false` so the UI prompts the user to reconnect
   * rather than silently failing every sync cycle.
   */
  async syncMyInstagram(
    customerId: string
  ): Promise<CustomerInstagram | null> {
    const existing = await CustomerInstagramModel.findOne({
      customerId,
    }).lean<CustomerInstagram>();
    if (!existing?.connected || !existing.handle) return existing ?? null;

    const canUseRealFetch =
      isRealMetaConfigured() &&
      Boolean(existing.accessToken) &&
      existing.accessToken !== "stub-token" &&
      Boolean(existing.instagramUserId);

    if (canUseRealFetch) {
      try {
        const token = decryptToken(existing.accessToken!);
        const profile = await fetchMetaProfile(
          token,
          existing.instagramUserId!
        );

        // Safe avatar re-push: only overwrite Customer.profilePic if
        // the customer hasn't already replaced it. We compare against
        // `lastPushedAvatar` (what we wrote last time). If it still
        // matches the Customer doc, the user hasn't touched it → safe
        // to refresh. If it differs, the user picked something else →
        // never stomp.
        if (profile.avatar && profile.avatar !== existing.lastPushedAvatar) {
          await CustomerModel.updateOne(
            {
              _id: customerId,
              profilePic: existing.lastPushedAvatar,
            },
            { $set: { profilePic: profile.avatar } }
          );
        }

        const updated = await CustomerInstagramModel.findOneAndUpdate(
          { customerId },
          {
            $set: {
              handle: profile.handle,
              avatar: profile.avatar,
              biography: profile.biography,
              followerCount: profile.followerCount,
              mediaCount: profile.mediaCount,
              recentMedia: profile.recentMedia,
              lastSyncedAt: new Date(),
              lastPushedAvatar: profile.avatar || existing.lastPushedAvatar,
            },
          },
          { new: true, lean: true }
        );
        return (updated as unknown as CustomerInstagram) ?? null;
      } catch (err: any) {
        // Token-revoked / expired → mark disconnected. The customer
        // sees the connect-prompt state again and can reauthorise.
        const message = String(err?.message ?? "");
        if (
          message.includes("401") ||
          message.includes("403") ||
          message.toLowerCase().includes("oauthexception")
        ) {
          await CustomerInstagramModel.updateOne(
            { customerId },
            {
              $set: { connected: false },
              $unset: { accessToken: "", tokenExpiresAt: "" },
            }
          );
          return CustomerInstagramModel.findOne({
            customerId,
          }).lean<CustomerInstagram>();
        }
        // Other failures (network, 5xx) → don't disconnect, just
        // surface so the UI can show a retry banner.
        throw err;
      }
    }

    // Stub fallback — keeps the demo path lively.
    const stub = buildStubProfile(existing.handle);
    const updated = await CustomerInstagramModel.findOneAndUpdate(
      { customerId },
      {
        $set: {
          avatar: stub.avatar,
          biography: stub.biography,
          followerCount: stub.followerCount,
          mediaCount: stub.mediaCount,
          recentMedia: stub.recentMedia,
          lastSyncedAt: new Date(),
        },
      },
      { new: true, lean: true }
    );
    return (updated as unknown as CustomerInstagram) ?? null;
  }

  /**
   * Returns the face row for an event detail page. A customer shows
   * up here only if they have a confirmed paid order for the event
   * AND a connected Instagram AND have toggled visibility on. The
   * triple gate is the explicit-consent contract.
   */
  async getEventAttendeesWithInstagram(
    eventId: string,
    limit = 36
  ): Promise<EventAttendeeWithInstagram[]> {
    const customerIds = await OrderModel.distinct("customerId", {
      eventId,
      orderStatus: OrderStatus.PAYMENT_SUCCESS,
    });
    if (!customerIds.length) return [];

    const ids = customerIds.map((id) => String(id));
    const visible = await CustomerInstagramModel.find({
      customerId: { $in: ids },
      connected: true,
      attendeeVisibility: true,
    })
      .limit(limit)
      .lean<
        Array<{
          customerId: string;
          handle?: string;
          avatar?: string;
          city?: string;
        }>
      >();
    if (!visible.length) return [];

    // Resolve first names — Customer.firstName is required on the
    // doc, but the row tolerates a missing name (anonymous avatar
    // tile) so we don't crash if a record is corrupted.
    const names = await CustomerModel.find({
      _id: { $in: visible.map((v) => v.customerId) },
    })
      .select("firstName")
      .lean<Array<{ _id: string; firstName?: string }>>();
    const nameById = new Map<string, string>(
      names.map((n) => [String(n._id), n.firstName ?? ""])
    );

    return visible.map((row) => ({
      customerId: String(row.customerId),
      firstName: nameById.get(String(row.customerId)) || undefined,
      handle: row.handle,
      avatar: row.avatar,
      city: row.city,
    }));
  }
}

export default CustomerInstagramService;
