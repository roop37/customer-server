"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const shared_1 = require("@hoizr-technology/shared");
const bcrypt_1 = require("bcrypt");
const crypto_1 = __importDefault(require("crypto"));
const mercurius_1 = require("mercurius");
const environment_1 = require("../../../utils/environment");
const jwt_1 = require("../../../utils/jwt");
const rateLimit_1 = require("../../../utils/rateLimit");
const validations_1 = require("../../../utils/validations");
const event_schema_1 = require("../../event/schema/event.schema");
const order_schema_1 = require("../../order/schema/order.schema");
const scanner_objects_1 = require("../interfaces/scanner.objects");
const scanner_user_schema_1 = require("../schema/scanner-user.schema");
class ScannerService {
    async login(input) {
        const email = input.email.trim().toLowerCase();
        const accessCode = input.accessCode.trim().toUpperCase();
        if (!email || !accessCode) {
            throw new mercurius_1.ErrorWithProps("Email and access code are required");
        }
        // Brute-force protection: 8-char codes are ~40 bits and cheap to grind.
        // Same shape as customer OTP verify — 5 attempts/hour, exponential
        // lockout on failure, counter resets on successful login.
        const rlKey = `scanner_login:${email}`;
        if (!(await (0, rateLimit_1.checkRateLimit)(rlKey))) {
            throw new mercurius_1.ErrorWithProps("Too many failed attempts. Try again later.");
        }
        const scanner = await scanner_user_schema_1.ScannerUserModel.findOne({
            email,
            isDeleted: false,
            isActive: true,
        });
        if (!scanner || !scanner.accessCodeHash) {
            await (0, rateLimit_1.incrementRateLimit)(rlKey);
            throw new mercurius_1.ErrorWithProps("Invalid email or access code");
        }
        const valid = await (0, bcrypt_1.compare)(accessCode, scanner.accessCodeHash);
        if (!valid) {
            await (0, rateLimit_1.incrementRateLimit)(rlKey);
            throw new mercurius_1.ErrorWithProps("Invalid email or access code");
        }
        await (0, rateLimit_1.resetRateLimit)(rlKey);
        // Ensure the event is not over (give 24h grace after endDate for late
        // check-ins / disputes).
        const event = await event_schema_1.EventModel.findOne({
            _id: scanner.eventId,
            isDeleted: false,
        })
            .select("endDate status")
            .lean();
        if (!event) {
            throw new mercurius_1.ErrorWithProps("Event no longer exists");
        }
        if (event.endDate) {
            const cutoff = new Date(event.endDate);
            cutoff.setHours(cutoff.getHours() + 24);
            if (cutoff < new Date()) {
                throw new mercurius_1.ErrorWithProps("This event has ended. Contact the host if check-in is still required.");
            }
        }
        scanner.lastLoginAt = new Date();
        await scanner.save();
        const payload = {
            scanner: scanner._id.toString(),
            eventId: scanner.eventId,
            businessId: scanner.businessId,
            version: scanner.authTokenVersion ?? 0,
        };
        const { accessToken, refreshToken } = (0, jwt_1.createScannerAuthTokens)(payload);
        // Allowlist this refresh token. Any previously issued refresh
        // token for this scanner is invalidated by the overwrite.
        await (0, jwt_1.storeScannerRefreshToken)(scanner._id.toString(), refreshToken);
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
    async refreshTokens(refreshToken) {
        if (!refreshToken || typeof refreshToken !== "string") {
            throw new mercurius_1.ErrorWithProps("Refresh token is required");
        }
        // Rate-limit by token-hash to prevent brute-force of the refresh
        // endpoint with a leaked-but-revoked refresh token. The Lua
        // limiter is shared with login / OTP flows — same 5-attempts /
        // 1-hour window with exponential backoff beyond that.
        const rlKey = `scanner_refresh:${crypto_1.default
            .createHash("sha256")
            .update(refreshToken)
            .digest("hex")
            .slice(0, 16)}`;
        if (!(await (0, rateLimit_1.checkRateLimit)(rlKey))) {
            throw new mercurius_1.ErrorWithProps("Too many refresh attempts. Please sign in again.");
        }
        const pair = await (0, jwt_1.refreshScannerAuthTokens)(refreshToken);
        if (!pair) {
            await (0, rateLimit_1.incrementRateLimit)(rlKey);
            throw new mercurius_1.ErrorWithProps("Refresh token is invalid or expired");
        }
        await (0, rateLimit_1.resetRateLimit)(rlKey);
        return pair;
    }
    async getEventSummary(ctx) {
        if (!ctx.scannerEventId) {
            throw new mercurius_1.ErrorWithProps("Scanner context required");
        }
        const event = await event_schema_1.EventModel.findOne({ _id: ctx.scannerEventId })
            .select("title startDate endDate city")
            .lean();
        if (!event)
            throw new mercurius_1.ErrorWithProps("Event not found");
        const scanner = await scanner_user_schema_1.ScannerUserModel.findOne({ _id: ctx.scannerId })
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
    parseQrPayload(qr) {
        // QR format from webhook: `hoizr:{orderId}:{razorpayPaymentId}`
        if (!qr || !qr.startsWith("hoizr:"))
            return null;
        const parts = qr.split(":");
        if (parts.length !== 3)
            return null;
        const [, orderId, paymentId] = parts;
        if (!(0, validations_1.isAlphanumeric)(orderId) || !paymentId)
            return null;
        return { orderId, paymentId };
    }
    verifyQrHash(qrPayload, storedHash) {
        const expected = crypto_1.default
            .createHmac("sha256", environment_1.EnvVars.values.ENCRYPTION_KEY)
            .update(qrPayload)
            .digest("hex");
        // Constant-time comparison to mitigate timing attacks
        if (expected.length !== storedHash.length)
            return false;
        return crypto_1.default.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(storedHash, "hex"));
    }
    async scanTicket(input, ctx) {
        if (!ctx.scannerId || !ctx.scannerEventId) {
            return {
                status: scanner_objects_1.ScanResultStatus.SCANNER_INACTIVE,
                message: "Scanner session is not valid",
            };
        }
        const parsed = this.parseQrPayload(input.qrCodeData);
        if (!parsed) {
            return {
                status: scanner_objects_1.ScanResultStatus.INVALID_QR,
                message: "QR code is not a Hoizr ticket",
            };
        }
        const event = await event_schema_1.EventModel.findOne({
            _id: ctx.scannerEventId,
            isDeleted: false,
        })
            .select("startDate endDate status")
            .lean();
        if (!event) {
            return {
                status: scanner_objects_1.ScanResultStatus.ORDER_NOT_FOUND,
                message: "Event not found",
            };
        }
        // AUDIT-012: explicit cancelled gate — refuse any scan after a host
        // cancels the event, even if scanner sessions are still alive.
        if (event.status === shared_1.EventStatus.CANCELLED) {
            return {
                status: scanner_objects_1.ScanResultStatus.EVENT_ENDED,
                message: "Event has been cancelled — entry is no longer valid",
            };
        }
        const now = new Date();
        // AUDIT-011: refuse scans more than 2h before doors open. The
        // 2-hour grace covers staff testing scanners at setup time without
        // accidentally admitting attendees too early.
        const SCAN_GRACE_BEFORE_START_MS = 2 * 60 * 60 * 1000;
        if (event.startDate) {
            const startsAt = new Date(event.startDate).getTime();
            if (now.getTime() < startsAt - SCAN_GRACE_BEFORE_START_MS) {
                return {
                    status: scanner_objects_1.ScanResultStatus.EVENT_NOT_STARTED,
                    message: "Doors haven't opened yet",
                };
            }
        }
        if (event.status !== shared_1.EventStatus.PUBLISHED) {
            // Allow PUBLISHED, accept COMPLETED only if endDate is within the last 24h
            const endsAt = event.endDate ? new Date(event.endDate) : null;
            if (endsAt) {
                const cutoff = new Date(endsAt);
                cutoff.setHours(cutoff.getHours() + 24);
                if (cutoff < now) {
                    return {
                        status: scanner_objects_1.ScanResultStatus.EVENT_ENDED,
                        message: "Event check-in window has closed",
                    };
                }
            }
        }
        // Read the order once for state + HMAC verification BEFORE we claim
        // it. This avoids the rollback dance and ensures a tampered QR
        // never touches the database.
        const existing = await order_schema_1.OrderModel.findOne({
            _id: parsed.orderId,
            razorpayPaymentId: parsed.paymentId,
            isDeleted: false,
        }).lean();
        if (!existing) {
            return {
                status: scanner_objects_1.ScanResultStatus.ORDER_NOT_FOUND,
                message: "Order not found for this QR code",
            };
        }
        if (existing.eventId !== ctx.scannerEventId) {
            return {
                status: scanner_objects_1.ScanResultStatus.WRONG_EVENT,
                message: "This ticket is for a different event",
            };
        }
        if (existing.orderStatus === shared_1.OrderStatus.PAYMENT_PENDING ||
            existing.orderStatus === shared_1.OrderStatus.PAYMENT_FAILED ||
            existing.orderStatus === shared_1.OrderStatus.SUPERSEDED) {
            return {
                status: scanner_objects_1.ScanResultStatus.PAYMENT_INCOMPLETE,
                message: existing.orderStatus === shared_1.OrderStatus.SUPERSEDED
                    ? "This ticket was replaced by a newer order"
                    : "Payment for this ticket is not complete",
            };
        }
        if (existing.orderStatus === shared_1.OrderStatus.CANCELLED) {
            return {
                status: scanner_objects_1.ScanResultStatus.CANCELLED,
                message: "This ticket has been cancelled",
            };
        }
        // Refund policy (product decision 2026-05-22): refunded orders are
        // still scannable. The scanner shows REFUNDED status alongside the
        // order details so door staff can decide whether to honor the
        // ticket — useful for partial-refund cases (V1 has no per-seat
        // tracking) and for chargebacks/disputes still under review. The
        // status is surfaced; the entry decision is the doorman's.
        const wasRefunded = existing.orderStatus === shared_1.OrderStatus.REFUNDED ||
            Number(existing.refundAmount ?? 0) > 0;
        if (existing.checkedIn ||
            existing.orderStatus === shared_1.OrderStatus.CHECKED_IN) {
            return {
                status: scanner_objects_1.ScanResultStatus.ALREADY_CHECKED_IN,
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
                    tickets: (existing.tickets ?? []).map((t) => ({
                        ticketName: t.ticketName,
                        quantity: t.quantity,
                    })),
                    extras: (existing.extras ?? []).map((e) => ({
                        extraName: e.extraName,
                        quantity: e.quantity,
                    })),
                    totalTickets: (existing.tickets ?? []).reduce((sum, t) => sum + Number(t.quantity ?? 0), 0),
                    checkedInAt: existing.checkedInAt ?? new Date(),
                    previousCheckInAt: existing.checkedInAt ?? undefined,
                },
            };
        }
        // Scannable states: PAYMENT_SUCCESS, or REFUNDED (per the product
        // decision above — door staff still gets full details + refund flag).
        if (existing.orderStatus !== shared_1.OrderStatus.PAYMENT_SUCCESS &&
            existing.orderStatus !== shared_1.OrderStatus.REFUNDED) {
            return {
                status: scanner_objects_1.ScanResultStatus.INVALID_QR,
                message: "Ticket is not in a scannable state",
            };
        }
        // Defense-in-depth HMAC verify BEFORE the database claim — a
        // tampered QR never gets a chance to flip the order's status.
        if (existing.qrCodeHash &&
            !this.verifyQrHash(input.qrCodeData, existing.qrCodeHash)) {
            return {
                status: scanner_objects_1.ScanResultStatus.INVALID_QR,
                message: "QR code signature is invalid",
            };
        }
        // Atomic claim: race-safe against parallel scanners. Only the
        // first scanner to find the order in [PAYMENT_SUCCESS, REFUNDED]
        // + !checkedIn wins; everyone else's update misses and we re-read
        // to classify. For PAYMENT_SUCCESS we flip orderStatus to
        // CHECKED_IN; for REFUNDED we preserve REFUNDED so the order's
        // refund history isn't overwritten (handled via the aggregation
        // pipeline update so it's still a single atomic op).
        // (`now` is declared at the top of scanTicket for the start-date check.)
        const claimed = await order_schema_1.OrderModel.findOneAndUpdate({
            _id: parsed.orderId,
            eventId: ctx.scannerEventId,
            razorpayPaymentId: parsed.paymentId,
            orderStatus: {
                $in: [shared_1.OrderStatus.PAYMENT_SUCCESS, shared_1.OrderStatus.REFUNDED],
            },
            checkedIn: false,
            isDeleted: false,
        }, [
            {
                $set: {
                    checkedIn: true,
                    checkedInAt: now,
                    scannedBy: ctx.scannerId,
                    orderStatus: {
                        $cond: [
                            { $eq: ["$orderStatus", shared_1.OrderStatus.PAYMENT_SUCCESS] },
                            shared_1.OrderStatus.CHECKED_IN,
                            "$orderStatus",
                        ],
                    },
                    checkInDates: {
                        $concatArrays: [{ $ifNull: ["$checkInDates", []] }, [now]],
                    },
                },
            },
        ], { new: true }).lean();
        if (!claimed) {
            // Lost the race to another scanner between our read and the claim.
            // Treat as ALREADY_CHECKED_IN — the parallel scanner will have
            // the winning row in DB by now.
            return {
                status: scanner_objects_1.ScanResultStatus.ALREADY_CHECKED_IN,
                message: "Already checked in moments ago",
            };
        }
        await scanner_user_schema_1.ScannerUserModel.updateOne({ _id: ctx.scannerId }, { $inc: { totalScanned: 1 } });
        const totalTickets = (claimed.tickets ?? []).reduce((sum, t) => sum + Number(t.quantity ?? 0), 0);
        return {
            status: wasRefunded ? scanner_objects_1.ScanResultStatus.REFUNDED : scanner_objects_1.ScanResultStatus.OK,
            message: wasRefunded
                ? "Order has been refunded — verify with host before admitting"
                : "Ticket valid. Welcome in!",
            order: {
                orderId: claimed._id.toString(),
                customerName: [claimed.guestInfo?.firstName, claimed.guestInfo?.lastName]
                    .filter(Boolean)
                    .join(" "),
                customerPhone: claimed.guestInfo?.phone,
                tickets: (claimed.tickets ?? []).map((t) => ({
                    ticketName: t.ticketName,
                    quantity: t.quantity,
                })),
                extras: (claimed.extras ?? []).map((e) => ({
                    extraName: e.extraName,
                    quantity: e.quantity,
                })),
                totalTickets,
                checkedInAt: now,
            },
        };
    }
}
exports.default = ScannerService;
