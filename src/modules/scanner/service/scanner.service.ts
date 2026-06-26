import {
  EventStatus,
  GuestlistEntryStatus,
  isMultiDay,
  OrderStatus,
  resolveCurrentDayId,
  ticketAdmitsDay,
} from "@hoizr-technology/shared";
import { compare } from "bcrypt";
import crypto from "crypto";
import { ErrorWithProps } from "mercurius";
import Context from "../../../types/context.type";
import { verifyQrHashVersioned } from "../../../utils/qr-hash";
import { parseGuestlistQrPayload } from "../../../utils/guestlist-qr";
import { GuestlistEntryModel } from "../../guestlist/schema/guestlist.schema";
import {
  JwtScannerPayload,
  createScannerAuthTokens,
  refreshScannerAuthTokens,
  storeScannerRefreshToken,
} from "../../../utils/jwt";
import {
  checkRateLimit,
  incrementRateLimit,
  resetRateLimit,
} from "../../../utils/rateLimit";
import { isAlphanumeric } from "../../../utils/validations";
import { EventModel } from "../../event/schema/event.schema";
import { OrderModel } from "../../order/schema/order.schema";
import {
  ScanTicketInput,
  ScannerLoginInput,
} from "../interfaces/scanner.input";
import {
  OfflineScanResult,
  ScanResultStatus,
  ScanTicketResponse,
  ScannerEventSummary,
  ScannerLoginResponse,
  ScannerManifest,
  ScannerManifestEntry,
} from "../interfaces/scanner.objects";
import { ScannerUserModel } from "../schema/scanner-user.schema";

// Door staff can start scanning 2h before the doors open. When the host has set
// a "gates open before the event" lead in the event guide, the doors open that
// much earlier than the event start — so scanning opens earlier too. Returns
// the gates-open lead in ms (0 when not configured), to ADD to the 2h grace on
// the START side only (never extends the end of the check-in window).
const gatesOpenLeadMs = (event: any): number => {
  const g = event?.eventGuide;
  if (!g?.gatesOpenBeforeEvent) return 0;
  const ms =
    Number(g.gatesOpenLeadHours ?? 0) * 3_600_000 +
    Number(g.gatesOpenLeadMinutes ?? 0) * 60_000;
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
};

class ScannerService {
  async login(input: ScannerLoginInput): Promise<ScannerLoginResponse> {
    const email = input.email.trim().toLowerCase();
    const accessCode = input.accessCode.trim().toUpperCase();

    if (!email || !accessCode) {
      throw new ErrorWithProps("Email and access code are required");
    }

    // Brute-force protection: 8-char codes are ~40 bits and cheap to grind.
    // Same shape as customer OTP verify — 5 attempts/hour, exponential
    // lockout on failure, counter resets on successful login.
    const rlKey = `scanner_login:${email}`;
    if (!(await checkRateLimit(rlKey))) {
      throw new ErrorWithProps(
        "Too many failed attempts. Try again later."
      );
    }

    const scanner = await ScannerUserModel.findOne({
      email,
      isDeleted: false,
      isActive: true,
    });

    if (!scanner || !scanner.accessCodeHash) {
      await incrementRateLimit(rlKey);
      throw new ErrorWithProps("Invalid email or access code");
    }

    const valid = await compare(accessCode, scanner.accessCodeHash);
    if (!valid) {
      await incrementRateLimit(rlKey);
      throw new ErrorWithProps("Invalid email or access code");
    }
    await resetRateLimit(rlKey);

    // AUDIT-024: codes expire 24h after the event ends (set at create/
    // regenerate in main-server). Expired ≠ wrong, so say so — the host
    // fixes it by regenerating the code. Scanners created before the
    // expiry field shipped have no expiresAt and keep working.
    if (
      scanner.accessCodeExpiresAt &&
      new Date(scanner.accessCodeExpiresAt) < new Date()
    ) {
      throw new ErrorWithProps(
        "This access code has expired. Ask the organizer to regenerate it."
      );
    }

    // Ensure the event is not over (give 24h grace after endDate for late
    // check-ins / disputes).
    const event = await EventModel.findOne({
      _id: scanner.eventId,
      isDeleted: false,
    })
      .select("endDate status")
      .lean();
    if (!event) {
      throw new ErrorWithProps("Event no longer exists");
    }
    if (event.endDate) {
      const cutoff = new Date(event.endDate);
      cutoff.setHours(cutoff.getHours() + 24);
      if (cutoff < new Date()) {
        throw new ErrorWithProps(
          "This event has ended. Contact the host if check-in is still required."
        );
      }
    }

    scanner.lastLoginAt = new Date();
    await scanner.save();

    const payload: JwtScannerPayload = {
      scanner: scanner._id.toString(),
      eventId: scanner.eventId,
      businessId: scanner.businessId,
      version: scanner.authTokenVersion ?? 0,
    };
    const { accessToken, refreshToken } = createScannerAuthTokens(payload);
    // Allowlist this refresh token. Any previously issued refresh
    // token for this scanner is invalidated by the overwrite.
    await storeScannerRefreshToken(scanner._id.toString(), refreshToken);

    return {
      scannerId: scanner._id.toString(),
      eventId: scanner.eventId,
      businessId: scanner.businessId,
      scannerName: scanner.scannerName,
      scannerType: scanner.scannerType,
      accessToken,
      refreshToken,
    };
  }

  /**
   * Refresh a scanner's tokens using their long-lived refresh token.
   * The JWT verifier (`refreshScannerAuthTokens`) also rechecks the
   * scanner's DB-tied `authTokenVersion`, so revoked or deactivated
   * scanners can't refresh into a fresh session.
   */
  async refreshTokens(
    refreshToken: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    if (!refreshToken || typeof refreshToken !== "string") {
      throw new ErrorWithProps("Refresh token is required");
    }
    // Rate-limit by token-hash to prevent brute-force of the refresh
    // endpoint with a leaked-but-revoked refresh token. The Lua
    // limiter is shared with login / OTP flows — same 5-attempts /
    // 1-hour window with exponential backoff beyond that.
    const rlKey = `scanner_refresh:${crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex")
      .slice(0, 16)}`;
    if (!(await checkRateLimit(rlKey))) {
      throw new ErrorWithProps(
        "Too many refresh attempts. Please sign in again."
      );
    }
    const pair = await refreshScannerAuthTokens(refreshToken);
    if (!pair) {
      await incrementRateLimit(rlKey);
      throw new ErrorWithProps("Refresh token is invalid or expired");
    }
    await resetRateLimit(rlKey);
    return pair;
  }

  async getEventSummary(ctx: Context): Promise<ScannerEventSummary> {
    if (!ctx.scannerEventId) {
      throw new ErrorWithProps("Scanner context required");
    }
    const event = await EventModel.findOne({ _id: ctx.scannerEventId })
      .select("title startDate endDate city")
      .lean();
    if (!event) throw new ErrorWithProps("Event not found");

    const scanner = await ScannerUserModel.findOne({ _id: ctx.scannerId })
      .select("totalScanned")
      .lean();

    return {
      eventId: ctx.scannerEventId,
      title: event.title,
      startDate: event.startDate,
      endDate: event.endDate,
      city: event.city,
      totalScanned: scanner?.totalScanned ?? 0,
    };
  }

  private parseQrPayload(qr: string): { orderId: string; paymentId: string } | null {
    // QR format from webhook: `hoizr:{orderId}:{razorpayPaymentId}`
    if (!qr || !qr.startsWith("hoizr:")) return null;
    const parts = qr.split(":");
    if (parts.length !== 3) return null;
    const [, orderId, paymentId] = parts;
    if (!isAlphanumeric(orderId) || !paymentId) return null;
    return { orderId, paymentId };
  }

  private verifyQrHash(
    qrPayload: string,
    storedHash: string,
    qrHashVersion?: number | null
  ): boolean {
    // AUDIT-023: pick the HMAC key by the version the ticket was signed
    // with (utils/qr-hash.ts) so key rotation can't invalidate live
    // tickets. Constant-time comparison inside.
    return verifyQrHashVersioned(qrPayload, storedHash, qrHashVersion);
  }

  private guestlistOrderView(entry: any) {
    return {
      orderId: String(entry._id),
      customerName: entry.guestName ?? "Guest",
      customerPhone: entry.guestPhone ?? undefined,
      tickets: [{ ticketName: "Guestlist", quantity: 1 }],
      extras: [] as { extraName: string; quantity: number }[],
      totalTickets: 1,
      checkedInAt: entry.checkedInAt ?? new Date(),
    };
  }

  /**
   * Check in a guestlist golden ticket. Mirrors the order-scan event gates
   * (cancelled / not-started / ended), validates the entry's own QR HMAC,
   * then atomically claims the check-in.
   */
  private async scanGuestlistEntry(
    parsed: { entryId: string; code: string },
    qrPayload: string,
    ctx: Context,
    asOf: Date
  ): Promise<ScanTicketResponse> {
    const event = await EventModel.findOne({
      _id: ctx.scannerEventId,
      isDeleted: false,
    })
      .select("startDate endDate status days eventGuide")
      .lean();
    if (!event) {
      return {
        status: ScanResultStatus.ORDER_NOT_FOUND,
        message: "Event not found",
      };
    }
    if (event.status === EventStatus.CANCELLED) {
      return {
        status: ScanResultStatus.EVENT_ENDED,
        message: "Event has been cancelled — entry is no longer valid",
      };
    }

    const now = asOf;
    // Open scanning 2h before doors. If the host set a gates-open lead, doors
    // open before the event start, so scanning opens that much earlier too.
    const SCAN_GRACE_BEFORE_START_MS = 2 * 60 * 60 * 1000 + gatesOpenLeadMs(event);
    if (
      event.startDate &&
      now.getTime() <
        new Date(event.startDate).getTime() - SCAN_GRACE_BEFORE_START_MS
    ) {
      return {
        status: ScanResultStatus.EVENT_NOT_STARTED,
        message: "Doors haven't opened yet",
      };
    }
    if (event.status !== EventStatus.PUBLISHED) {
      const endsAt = event.endDate ? new Date(event.endDate) : null;
      if (endsAt) {
        const cutoff = new Date(endsAt);
        cutoff.setHours(cutoff.getHours() + 24);
        if (cutoff < now) {
          return {
            status: ScanResultStatus.EVENT_ENDED,
            message: "Event check-in window has closed",
          };
        }
      }
    }

    const entry = await GuestlistEntryModel.findById(parsed.entryId).lean();
    if (!entry || !entry.qrCodeHash) {
      return {
        status: ScanResultStatus.ORDER_NOT_FOUND,
        message: "Guest pass not found for this QR code",
      };
    }
    if (String(entry.eventId) !== String(ctx.scannerEventId)) {
      return {
        status: ScanResultStatus.WRONG_EVENT,
        message: "This guest pass is for a different event",
      };
    }
    if (entry.status === GuestlistEntryStatus.REVOKED) {
      return {
        status: ScanResultStatus.CANCELLED,
        message: "Guestlist access was revoked",
      };
    }
    if (entry.status !== GuestlistEntryStatus.ACCEPTED) {
      return {
        status: ScanResultStatus.INVALID_QR,
        message: "Guest pass is not active yet",
      };
    }
    // HMAC verify before the database claim — a tampered QR never flips state.
    if (!verifyQrHashVersioned(qrPayload, entry.qrCodeHash, entry.qrHashVersion)) {
      return {
        status: ScanResultStatus.INVALID_QR,
        message: "QR code signature is invalid",
      };
    }
    if (entry.checkedIn) {
      return {
        status: ScanResultStatus.ALREADY_CHECKED_IN,
        message: `Already checked in at ${
          entry.checkedInAt?.toLocaleString() ?? "earlier"
        }`,
        order: this.guestlistOrderView(entry),
      };
    }

    // Atomic claim — race-safe against parallel scanners.
    const claimed = await GuestlistEntryModel.findOneAndUpdate(
      {
        _id: entry._id,
        status: GuestlistEntryStatus.ACCEPTED,
        checkedIn: false,
      },
      { $set: { checkedIn: true, checkedInAt: now } },
      { new: true }
    ).lean();
    if (!claimed) {
      return {
        status: ScanResultStatus.ALREADY_CHECKED_IN,
        message: "Already checked in moments ago",
      };
    }

    await ScannerUserModel.updateOne(
      { _id: ctx.scannerId },
      { $inc: { totalScanned: 1 } }
    );

    return {
      status: ScanResultStatus.OK,
      message: "Guestlist pass valid. Welcome in!",
      order: this.guestlistOrderView(claimed),
    };
  }

  async scanTicket(
    input: ScanTicketInput,
    ctx: Context,
    // AUDIT-016: when replaying an OFFLINE scan, evaluate the ticket as of
    // when it was actually scanned (so the door-window checks + check-in
    // timestamp reflect the real moment, not the later sync time).
    asOf: Date = new Date()
  ): Promise<ScanTicketResponse> {
    if (!ctx.scannerId || !ctx.scannerEventId) {
      return {
        status: ScanResultStatus.SCANNER_INACTIVE,
        message: "Scanner session is not valid",
      };
    }

    // Guestlist golden tickets use a distinct QR (`hoizr-gl:…`) + their own
    // collection — route them before the order parse.
    const guestlistParsed = parseGuestlistQrPayload(input.qrCodeData);
    if (guestlistParsed) {
      return this.scanGuestlistEntry(
        guestlistParsed,
        input.qrCodeData,
        ctx,
        asOf
      );
    }

    const parsed = this.parseQrPayload(input.qrCodeData);
    if (!parsed) {
      return {
        status: ScanResultStatus.INVALID_QR,
        message: "QR code is not a Hoizr ticket",
      };
    }

    const event = await EventModel.findOne({
      _id: ctx.scannerEventId,
      isDeleted: false,
    })
      .select("startDate endDate status days eventGuide")
      .lean();
    if (!event) {
      return {
        status: ScanResultStatus.ORDER_NOT_FOUND,
        message: "Event not found",
      };
    }

    // AUDIT-012: explicit cancelled gate — refuse any scan after a host
    // cancels the event, even if scanner sessions are still alive.
    if (event.status === EventStatus.CANCELLED) {
      return {
        status: ScanResultStatus.EVENT_ENDED,
        message: "Event has been cancelled — entry is no longer valid",
      };
    }

    const now = asOf;

    // AUDIT-011: refuse scans more than 2h before doors open. The
    // 2-hour grace covers staff testing scanners at setup time without
    // accidentally admitting attendees too early.
    // Open scanning 2h before doors. If the host set a gates-open lead, doors
    // open before the event start, so scanning opens that much earlier too.
    const SCAN_GRACE_BEFORE_START_MS = 2 * 60 * 60 * 1000 + gatesOpenLeadMs(event);
    if (event.startDate) {
      const startsAt = new Date(event.startDate).getTime();
      if (now.getTime() < startsAt - SCAN_GRACE_BEFORE_START_MS) {
        return {
          status: ScanResultStatus.EVENT_NOT_STARTED,
          message: "Doors haven't opened yet",
        };
      }
    }

    if (event.status !== EventStatus.PUBLISHED) {
      // Allow PUBLISHED, accept COMPLETED only if endDate is within the last 24h
      const endsAt = event.endDate ? new Date(event.endDate) : null;
      if (endsAt) {
        const cutoff = new Date(endsAt);
        cutoff.setHours(cutoff.getHours() + 24);
        if (cutoff < now) {
          return {
            status: ScanResultStatus.EVENT_ENDED,
            message: "Event check-in window has closed",
          };
        }
      }
    }

    // Read the order once for state + HMAC verification BEFORE we claim
    // it. This avoids the rollback dance and ensures a tampered QR
    // never touches the database.
    const existing = await OrderModel.findOne({
      _id: parsed.orderId,
      razorpayPaymentId: parsed.paymentId,
      isDeleted: false,
    }).lean();

    if (!existing) {
      return {
        status: ScanResultStatus.ORDER_NOT_FOUND,
        message: "Order not found for this QR code",
      };
    }

    if (existing.eventId !== ctx.scannerEventId) {
      return {
        status: ScanResultStatus.WRONG_EVENT,
        message: "This ticket is for a different event",
      };
    }

    if (
      existing.orderStatus === OrderStatus.PAYMENT_PENDING ||
      existing.orderStatus === OrderStatus.PAYMENT_FAILED ||
      existing.orderStatus === OrderStatus.SUPERSEDED
    ) {
      return {
        status: ScanResultStatus.PAYMENT_INCOMPLETE,
        message:
          existing.orderStatus === OrderStatus.SUPERSEDED
            ? "This ticket was replaced by a newer order"
            : "Payment for this ticket is not complete",
      };
    }

    if (existing.orderStatus === OrderStatus.CANCELLED) {
      return {
        status: ScanResultStatus.CANCELLED,
        message: "This ticket has been cancelled",
      };
    }

    // Refund policy (2026-06-15): a FULLY-refunded ticket — or one with a full
    // refund in flight (`fullRefundPending`, set the moment the refund is
    // triggered) — is NOT valid for entry. Evaluated BEFORE the HMAC check so a
    // cleared qrCodeHash can never slip through to the check-in claim. Partial
    // refunds (still PAYMENT_SUCCESS, no fullRefundPending) fall through and are
    // soft-flagged below.
    if (
      existing.orderStatus === OrderStatus.REFUNDED ||
      existing.paymentMeta?.fullRefundPending === true
    ) {
      return {
        status: ScanResultStatus.REFUNDED,
        message: "This ticket was refunded and is not valid for entry",
      };
    }

    // Refund policy (product decision 2026-05-22): refunded orders are
    // still scannable. The scanner shows REFUNDED status alongside the
    // order details so door staff can decide whether to honor the
    // ticket — useful for partial-refund cases (V1 has no per-seat
    // tracking) and for chargebacks/disputes still under review. The
    // status is surfaced; the entry decision is the doorman's.
    // Full refunds are rejected above; only a PARTIAL refund (refundAmount > 0
    // on a still-PAYMENT_SUCCESS order) reaches here — soft-flag for door staff.
    const wasRefunded = Number(existing.refundAmount ?? 0) > 0;

    if (
      existing.checkedIn ||
      existing.orderStatus === OrderStatus.CHECKED_IN
    ) {
      return {
        status: ScanResultStatus.ALREADY_CHECKED_IN,
        message: `Already checked in at ${existing.checkedInAt?.toLocaleString() ?? "earlier"}`,
        order: {
          orderId: existing._id.toString(),
          customerName: [
            existing.guestInfo?.firstName,
            existing.guestInfo?.lastName,
          ]
            .filter(Boolean)
            .join(" "),
          customerPhone: existing.guestInfo?.phone,
          tickets: (existing.tickets ?? []).map((t: any) => ({
            ticketName: t.ticketName,
            quantity: t.quantity,
          })),
          extras: (existing.extras ?? []).map((e: any) => ({
            extraName: e.extraName,
            quantity: e.quantity,
          })),
          totalTickets: (existing.tickets ?? []).reduce(
            (sum: number, t: any) => sum + Number(t.quantity ?? 0),
            0
          ),
          checkedInAt: existing.checkedInAt ?? new Date(),
          previousCheckInAt: existing.checkedInAt ?? undefined,
        },
      };
    }

    // Scannable state: PAYMENT_SUCCESS only. Full refunds are rejected above;
    // partial refunds remain PAYMENT_SUCCESS and pass here (soft-flagged later).
    if (existing.orderStatus !== OrderStatus.PAYMENT_SUCCESS) {
      return {
        status: ScanResultStatus.INVALID_QR,
        message: "Ticket is not in a scannable state",
      };
    }

    // Defense-in-depth HMAC verify BEFORE the database claim — a
    // tampered QR never gets a chance to flip the order's status.
    if (
      existing.qrCodeHash &&
      !this.verifyQrHash(
        input.qrCodeData,
        existing.qrCodeHash,
        existing.qrHashVersion
      )
    ) {
      return {
        status: ScanResultStatus.INVALID_QR,
        message: "QR code signature is invalid",
      };
    }

    // Multi-day events use per-day check-in (order.dayCheckIns) instead of the
    // single-day `checkedIn` boolean, so an all-days pass can enter on each
    // day. We never flip `checkedIn`/orderStatus here, so the single-day gates
    // above pass through untouched for these orders.
    if (isMultiDay(event as any)) {
      // Resolve today's day with a 2h grace each side, mirroring the
      // doors-open grace; between days no day resolves.
      // 2h grace each side; the gates-open lead extends the START side only
      // (scanning opens earlier when doors open before each day's start) — it
      // must NOT push out the end of the check-in window.
      const END_GRACE_MS = 2 * 60 * 60 * 1000;
      const START_GRACE_MS = END_GRACE_MS + gatesOpenLeadMs(event);
      const graceDays = ((event as any).days ?? []).map((d: any) => ({
        dayId: d.dayId,
        startDate: new Date(new Date(d.startDate).getTime() - START_GRACE_MS),
        endDate: new Date(new Date(d.endDate).getTime() + END_GRACE_MS),
      }));
      const dayId = resolveCurrentDayId({ days: graceDays } as any, now);
      if (!dayId) {
        return {
          status: ScanResultStatus.EVENT_NOT_STARTED,
          message: "No event day is open for entry right now.",
        };
      }
      const admits = (existing.tickets ?? []).some((t: any) =>
        ticketAdmitsDay(t, dayId)
      );
      if (!admits) {
        return {
          status: ScanResultStatus.WRONG_DAY,
          message: "This ticket isn't valid for today.",
        };
      }
      // Atomic per-day claim: push only if no entry exists for this day yet.
      // The `dayCheckIns.dayId != dayId` filter makes a same-day re-scan (or a
      // parallel-scanner race) miss → ALREADY_CHECKED_IN, while a different day
      // still succeeds.
      const claimedDay = await OrderModel.findOneAndUpdate(
        {
          _id: parsed.orderId,
          eventId: ctx.scannerEventId,
          razorpayPaymentId: parsed.paymentId,
          orderStatus: OrderStatus.PAYMENT_SUCCESS,
          isDeleted: false,
          "dayCheckIns.dayId": { $ne: dayId },
        },
        {
          $push: {
            dayCheckIns: { dayId, checkedInAt: now, scannerId: ctx.scannerId },
          },
        },
        { new: true }
      ).lean();

      if (!claimedDay) {
        return {
          status: ScanResultStatus.ALREADY_CHECKED_IN,
          message: "Already checked in for today.",
        };
      }

      await ScannerUserModel.updateOne(
        { _id: ctx.scannerId },
        { $inc: { totalScanned: 1 } }
      );

      const totalTicketsDay = (claimedDay.tickets ?? []).reduce(
        (sum: number, t: any) => sum + Number(t.quantity ?? 0),
        0
      );

      return {
        status: wasRefunded ? ScanResultStatus.REFUNDED : ScanResultStatus.OK,
        message: wasRefunded
          ? "Order has been refunded — verify with host before admitting"
          : "Ticket valid. Welcome in!",
        order: {
          orderId: claimedDay._id.toString(),
          customerName: [
            claimedDay.guestInfo?.firstName,
            claimedDay.guestInfo?.lastName,
          ]
            .filter(Boolean)
            .join(" "),
          customerPhone: claimedDay.guestInfo?.phone,
          tickets: (claimedDay.tickets ?? []).map((t: any) => ({
            ticketName: t.ticketName,
            quantity: t.quantity,
          })),
          extras: (claimedDay.extras ?? []).map((e: any) => ({
            extraName: e.extraName,
            quantity: e.quantity,
          })),
          totalTickets: totalTicketsDay,
          checkedInAt: now,
        },
      };
    }

    // Atomic claim: race-safe against parallel scanners. Only the first
    // scanner to find the order in PAYMENT_SUCCESS + !checkedIn wins; everyone
    // else's update misses and we re-read to classify. Refunded / in-flight
    // orders are already rejected above, so only a genuine paid ticket reaches
    // here and is flipped to CHECKED_IN.
    // (`now` is declared at the top of scanTicket for the start-date check.)
    const claimed = await OrderModel.findOneAndUpdate(
      {
        _id: parsed.orderId,
        eventId: ctx.scannerEventId,
        razorpayPaymentId: parsed.paymentId,
        orderStatus: { $in: [OrderStatus.PAYMENT_SUCCESS] },
        checkedIn: false,
        isDeleted: false,
      },
      [
        {
          $set: {
            checkedIn: true,
            checkedInAt: now,
            scannedBy: ctx.scannerId,
            orderStatus: {
              $cond: [
                { $eq: ["$orderStatus", OrderStatus.PAYMENT_SUCCESS] },
                OrderStatus.CHECKED_IN,
                "$orderStatus",
              ],
            },
            checkInDates: {
              $concatArrays: [{ $ifNull: ["$checkInDates", []] }, [now]],
            },
          },
        },
      ],
      { new: true }
    ).lean();

    if (!claimed) {
      // Lost the race to another scanner between our read and the claim.
      // Treat as ALREADY_CHECKED_IN — the parallel scanner will have
      // the winning row in DB by now.
      return {
        status: ScanResultStatus.ALREADY_CHECKED_IN,
        message: "Already checked in moments ago",
      };
    }

    await ScannerUserModel.updateOne(
      { _id: ctx.scannerId },
      { $inc: { totalScanned: 1 } }
    );

    const totalTickets = (claimed.tickets ?? []).reduce(
      (sum: number, t: any) => sum + Number(t.quantity ?? 0),
      0
    );

    return {
      status: wasRefunded ? ScanResultStatus.REFUNDED : ScanResultStatus.OK,
      message: wasRefunded
        ? "Order has been refunded — verify with host before admitting"
        : "Ticket valid. Welcome in!",
      order: {
        orderId: claimed._id.toString(),
        customerName: [claimed.guestInfo?.firstName, claimed.guestInfo?.lastName]
          .filter(Boolean)
          .join(" "),
        customerPhone: claimed.guestInfo?.phone,
        tickets: (claimed.tickets ?? []).map((t: any) => ({
          ticketName: t.ticketName,
          quantity: t.quantity,
        })),
        extras: (claimed.extras ?? []).map((e: any) => ({
          extraName: e.extraName,
          quantity: e.quantity,
        })),
        totalTickets,
        checkedInAt: now,
      },
    };
  }

  /**
   * AUDIT-016: offline manifest. The scanner downloads every valid ticket
   * for its event on login + stores it locally, so it can validate QR codes
   * and admit guests with NO network. Returns the QR payload (to match
   * against the scanned code), the customer/ticket details to display, and
   * the current check-in state (so the cache starts in sync).
   *
   * Refunded orders are included (still scannable per the product rule); the
   * client surfaces the refunded flag. The QR HMAC isn't verifiable offline
   * (server-only secret) — the manifest IS the trust anchor: a forged QR
   * whose orderId isn't in the manifest is rejected by the client.
   */
  async getEventManifest(ctx: Context): Promise<ScannerManifest> {
    if (!ctx.scannerId || !ctx.scannerEventId) {
      throw new ErrorWithProps("Scanner session is not valid");
    }

    const event = await EventModel.findOne({
      _id: ctx.scannerEventId,
      isDeleted: false,
    })
      .select("title startDate endDate status")
      .lean<any>();
    if (!event) throw new ErrorWithProps("Event not found");

    const orders = await OrderModel.find({
      eventId: ctx.scannerEventId,
      isDeleted: false,
      orderStatus: {
        $in: [
          OrderStatus.PAYMENT_SUCCESS,
          OrderStatus.CHECKED_IN,
          OrderStatus.REFUNDED,
        ],
      },
      qrCodeData: { $exists: true, $ne: null },
    })
      .select(
        "qrCodeData orderStatus checkedIn checkedInAt guestInfo tickets extras"
      )
      .lean<any[]>();

    const entries: ScannerManifestEntry[] = orders.map((o) => ({
      orderId: String(o._id),
      qrCodeData: o.qrCodeData,
      customerName:
        [o.guestInfo?.firstName, o.guestInfo?.lastName]
          .filter(Boolean)
          .join(" ") || undefined,
      customerPhone: o.guestInfo?.phone ?? undefined,
      tickets: (o.tickets ?? []).map((t: any) => ({
        ticketName: t.ticketName,
        quantity: Number(t.quantity ?? 0),
      })),
      totalTickets: (o.tickets ?? []).reduce(
        (sum: number, t: any) => sum + Number(t.quantity ?? 0),
        0
      ),
      checkedIn:
        !!o.checkedIn || o.orderStatus === OrderStatus.CHECKED_IN,
      checkedInAt: o.checkedInAt ?? undefined,
      refunded: o.orderStatus === OrderStatus.REFUNDED,
    }));

    return {
      eventId: String(event._id),
      title: event.title,
      startDate: event.startDate,
      endDate: event.endDate,
      generatedAt: new Date(),
      entries,
    };
  }

  /**
   * AUDIT-016: replay queued offline check-ins. Each item is run through the
   * normal scanTicket logic (atomic claim, all the same gates) but evaluated
   * "as of" the offline scan time, so the server stays the source of truth
   * and conflicts (already checked in by another door) come back per-item.
   * Idempotent: re-syncing an already-applied scan returns ALREADY_CHECKED_IN.
   */
  async syncOfflineScans(
    scans: Array<{ qrCodeData: string; scannedAt: Date | string }>,
    ctx: Context
  ): Promise<OfflineScanResult[]> {
    if (!ctx.scannerId || !ctx.scannerEventId) {
      throw new ErrorWithProps("Scanner session is not valid");
    }
    const results: OfflineScanResult[] = [];
    for (const scan of scans ?? []) {
      const asOf = scan.scannedAt ? new Date(scan.scannedAt) : new Date();
      try {
        const res = await this.scanTicket(
          { qrCodeData: scan.qrCodeData },
          ctx,
          Number.isNaN(asOf.getTime()) ? new Date() : asOf
        );
        results.push({
          qrCodeData: scan.qrCodeData,
          status: res.status,
          message: res.message,
        });
      } catch (err: any) {
        results.push({
          qrCodeData: scan.qrCodeData,
          status: ScanResultStatus.INVALID_QR,
          message: err?.message ?? "Sync failed",
        });
      }
    }
    return results;
  }
}

export default ScannerService;
