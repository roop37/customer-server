import axios from "axios";
import { swiggyDineoutConfig } from "../modules/dineout/config";

/**
 * Server-side ONLY wrapper for the Swiggy Dineout MCP. The per-user Bearer
 * token is injected here and never leaves the server. Transport is MCP
 * Streamable HTTP at {mcpBase}/dineout; raw JSON-RPC 2.0 `tools/call` POSTs
 * are a documented first-class pattern, which is what we use.
 *
 * Error contract (Swiggy builders docs snapshot, 2026-08-11): failures arrive
 * as either
 *   - HTTP 200 + { success: false, error: string | { message, code?, ... } }
 *     (domain failures like SLOT_UNAVAILABLE — message string is the contract), or
 *   - a JSON-RPC transport error { error: { code, message } } with code
 *     -32001 (unauthenticated/expired) or -32603 (internal), or
 *   - a non-2xx HTTP status.
 * Classify by message + HTTP status + JSON-RPC code until the registry ships.
 */

export type McpErrorClass =
  | "auth"
  | "revoked"
  | "bad_input"
  | "domain"
  | "rate_limited"
  | "upstream"
  | "internal"
  | "unknown";

/** Friendly message surfaced to the client when Swiggy throttles us. */
export const RATE_LIMIT_MESSAGE =
  "Swiggy is a little busy right now — give it a few seconds and try again.";

export type JsonRpcEnvelope = {
  jsonrpc: "2.0";
  method: "tools/call";
  id: number;
  params: { name: string; arguments: Record<string, unknown> };
};

export const buildJsonRpcEnvelope = (
  tool: string,
  args: Record<string, unknown>,
  id: number
): JsonRpcEnvelope => ({
  jsonrpc: "2.0",
  method: "tools/call",
  id,
  params: { name: tool, arguments: args },
});

export const classifyMcpError = (status: number): McpErrorClass => {
  if (status === 401) return "auth";
  if (status === 419) return "revoked";
  if (status === 403) return "auth";
  if (status === 429) return "rate_limited";
  if (status === 400) return "bad_input";
  if (status === 500) return "internal";
  if (status >= 502 && status <= 504) return "upstream";
  if (status >= 500) return "internal";
  return "unknown";
};

// JSON-RPC transport error codes Swiggy emits (docs): -32001 auth, -32603 internal.
export const classifyJsonRpcError = (code: number): McpErrorClass => {
  if (code === -32001) return "auth";
  if (code === -32603) return "internal";
  return "unknown";
};

/** Classify a parsed `success:false` tool envelope, including HTTP-200 errors. */
export const classifyToolFailure = (
  body: any,
  httpStatus = 200
): McpErrorClass => {
  const failure = body?.error;
  const code = String(
    (failure && typeof failure === "object" ? failure.code : undefined) ??
      body?.code ??
      ""
  ).toUpperCase();
  const message = String(
    typeof failure === "string" ? failure : failure?.message ?? ""
  )
    .trim()
    .toLowerCase();

  if (["UNAUTHENTICATED", "TOKEN_EXPIRED", "INSUFFICIENT_SCOPE"].includes(code)) {
    return "auth";
  }
  if (code === "SESSION_REVOKED") return "revoked";
  if (code === "RATE_LIMITED") return "rate_limited";
  if (code === "VALIDATION_ERROR") return "bad_input";
  if (["UPSTREAM_TIMEOUT", "UPSTREAM_ERROR"].includes(code)) return "upstream";
  if (code === "INTERNAL_ERROR") return "internal";
  if (
    [
      "NOT_FOUND",
      "SLOT_UNAVAILABLE",
      "RESTAURANT_NOT_BOOKABLE",
      "BOOKING_WINDOW_CLOSED",
    ].includes(code)
  ) {
    return "domain";
  }

  if (/\b(revoked)\b/.test(message)) return "revoked";
  if (
    /\b(unauthenticated|not authenticated|authentication required|token expired|invalid token|insufficient scope)\b/.test(
      message
    )
  ) {
    return "auth";
  }
  if (
    /\b(rate[-_\s]?limit(?:ed|ing)?|too many requests|quota (?:exceeded|exhausted))\b/.test(
      message
    )
  ) {
    return "rate_limited";
  }
  if (/\b(upstream|timed? out|timeout|bad gateway|service unavailable)\b/.test(message)) {
    return "upstream";
  }
  if (/\b(internal error|internal server|unexpected server)\b/.test(message)) {
    return "internal";
  }
  if (/^(invalid|missing)\b/.test(message)) return "bad_input";

  const byStatus = classifyMcpError(httpStatus);
  return byStatus === "unknown" ? "domain" : byStatus;
};

// Swiggy's official retry doctrine (500ms doubling → 8s cap), wired into
// callTool for READ tools. book_table is NOT retried (non-idempotent — the
// service passes retries: 0 and runs check-then-retry instead). A 429 stops
// the current call; callers use Retry-After before initiating fresh work.
export const isRetryable = (klass: McpErrorClass): boolean =>
  klass === "upstream" || klass === "internal";

// Official backoff shape: 500, 1000, 2000, 4000… with up to 30% jitter, hard
// capped at 8000ms so the cap is a real ceiling (jitter can't push past it).
// Callers cap at 5 attempts (Swiggy ship-to-production guidance).
export const backoffMs = (attempt: number): number => {
  const base = Math.min(8000, 500 * 2 ** (attempt - 1));
  const jitter = Math.random() * base * 0.3;
  return Math.min(8000, Math.round(base + jitter));
};

// book_table args are restaurantId + slotId + guestCount, so a given
// customer+restaurant+slot is booked once. Key the submit-lock on that tuple.
export const buildBookingDedupeKey = (input: {
  customerId: string;
  restaurantId: string;
  slotId: number;
}): string =>
  `swiggy:book:${input.customerId}:${input.restaurantId}:${input.slotId}`;

// Hoizr AddressInfo.coordinate.coordinates is GeoJSON [lng, lat]; every Swiggy
// dineout tool that takes coordinates wants { lat, lng }. SWAP — known footgun.
export const toSearchCoords = (
  coordinates: number[]
): { lat: number; lng: number } => ({
  lat: coordinates[1],
  lng: coordinates[0],
});

// Flat (not a discriminated union) on purpose: this codebase compiles with
// strictNullChecks OFF, under which TS does not narrow a discriminated union
// after an early return. A flat shape lets consumers read klass/message/data
// directly after an `if (res.ok)` check without relying on that narrowing.
/**
 * MCP Streamable HTTP responses arrive either as plain JSON or as an SSE
 * stream ("event:"/"data:" frames). Parse both into the JSON-RPC response
 * object. For SSE, the JSON-RPC response is the last data: frame that parses
 * to an object carrying result/error.
 */
export const parseMcpHttpBody = (raw: unknown): any => {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "object") return raw; // already parsed
  const text = String(raw).trim();
  if (!text) return null;
  // Plain JSON body.
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  // SSE body: collect data: lines per event; last parsable result/error wins.
  let best: any = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload) continue;
    try {
      const obj = JSON.parse(payload);
      if (obj && (obj.result !== undefined || obj.error !== undefined)) best = obj;
      else if (best === null) best = obj;
    } catch {
      /* non-JSON frame — skip */
    }
  }
  return best;
};

/**
 * Unwrap a JSON-RPC MCP response down to the Swiggy tool payload.
 * Verified against the LIVE API (2026-07-18): results carry
 *   - result.structuredContent — real JSON for details ({restaurant:{...}}) and
 *     saved locations ({data:{locations:[...]}}); EMPTY {} for search.
 *   - result._meta — the structured slots array for get_available_slots
 *     ({slots:[{displayTime, slotGroupName, dateStr, reservationTime, deals}]}).
 *   - result.content[{type:"text"}] — an agent-oriented TEXT rendering; the
 *     ONLY payload for search (parsed by the response mapper).
 * Prefer structuredContent+_meta merged; fall back to the text string.
 */
export const unwrapToolPayload = (parsed: any): any => {
  const result = parsed?.result ?? parsed;
  const structured =
    result?.structuredContent && typeof result.structuredContent === "object"
      ? result.structuredContent
      : {};
  const meta =
    result?._meta && typeof result._meta === "object" ? result._meta : {};
  const merged = { ...structured, ...meta };
  if (Object.keys(merged).length > 0) return merged;
  const textItem = Array.isArray(result?.content)
    ? result.content.find(
        (c: any) => c?.type === "text" && typeof c.text === "string"
      )
    : undefined;
  if (textItem) {
    try {
      return JSON.parse(textItem.text);
    } catch {
      return textItem.text; // agent-text payload (e.g. search) — mapper parses
    }
  }
  return result;
};

export type McpCallResult = {
  ok: boolean;
  data?: any;
  klass?: McpErrorClass;
  message?: string;
  reportLink?: string;
  reportHint?: string;
  hint?: string;
  possibleDuplicateRequest?: boolean;
  identifiers?: Record<string, string>;
  /** Swiggy's end-to-end support correlation id, when returned. */
  sessionId?: string;
  /** Parsed Swiggy tool envelope, retained for forward-compatible metadata. */
  envelope?: Record<string, unknown>;
  rateLimit?: {
    limit?: number;
    remaining?: number;
    reset?: number;
  };
  deprecation?: Record<string, unknown>;
  retryAfterSec?: number; // from a 429's Retry-After header, when present
};

const extractIdentifiers = (body: any): Record<string, string> | undefined => {
  const keys = [
    "orderId",
    "bookingId",
    "reservationId",
    "paasId",
    "transactionId",
    "cartKey",
  ];
  const sources = [
    body,
    body?.error,
    body?.data,
    body?.order,
    body?.booking,
    body?.cart,
  ];
  const identifiers: Record<string, string> = {};
  for (const key of keys) {
    const value = sources
      .map((source) => source?.[key])
      .find((candidate) => typeof candidate === "string" && candidate.length > 0);
    if (typeof value === "string") identifiers[key] = value;
  }
  return Object.keys(identifiers).length > 0 ? identifiers : undefined;
};

const unwrapSuccessData = (body: any): any =>
  body?.data ?? body?.order ?? body?.booking ?? body?.cart ?? body;

const readHeader = (headers: any, name: string): unknown => {
  if (!headers) return undefined;
  if (typeof headers.get === "function") {
    const value = headers.get(name);
    if (value !== undefined && value !== null) return value;
  }
  const wanted = name.toLowerCase();
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === wanted);
  return key ? headers[key] : undefined;
};

const parseRetryAfterSec = (headers: any): number | undefined => {
  const seconds = Number(readHeader(headers, "retry-after"));
  return Number.isFinite(seconds) ? seconds : undefined;
};

const parseRateLimitHeaders = (
  headers: any
): McpCallResult["rateLimit"] | undefined => {
  const readNumber = (name: string): number | undefined => {
    const value = Number(readHeader(headers, name));
    return Number.isFinite(value) ? value : undefined;
  };
  const rateLimit = {
    limit: readNumber("x-ratelimit-limit"),
    remaining: readNumber("x-ratelimit-remaining"),
    reset: readNumber("x-ratelimit-reset"),
  };
  return Object.values(rateLimit).some((value) => value !== undefined)
    ? rateLimit
    : undefined;
};

const extractSessionId = (
  parsed: any,
  body: any,
  headers: any
): string | undefined => {
  const candidates = [
    readHeader(headers, "mcp-session-id"),
    readHeader(headers, "x-session-id"),
    parsed?.result?._meta?.sessionId,
    parsed?.result?._meta?.session_id,
    body?._meta?.sessionId,
    body?._meta?.session_id,
    body?.sessionId,
    body?.session_id,
  ];
  return candidates.find(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0
  );
};

const extractDeprecation = (
  parsed: any,
  body: any
): Record<string, unknown> | undefined => {
  const metadata = [parsed?._meta, parsed?.result?._meta, body?._meta];
  for (const meta of metadata) {
    const deprecation =
      meta?.["swiggy.deprecation"] ?? meta?.swiggy?.deprecation;
    if (deprecation && typeof deprecation === "object") return deprecation;
  }
  const mergedDeprecation = body?.["swiggy.deprecation"];
  return mergedDeprecation && typeof mergedDeprecation === "object"
    ? mergedDeprecation
    : undefined;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

class SwiggyDineoutClient {
  private nextId = 1;

  /**
   * opts.retries: attempts AFTER the first call for retryable failures
   * (upstream/internal), with the official backoff and any Retry-After value
   * honored. Rate limits stop immediately. Defaults to 2 — pass 0 for
   * non-idempotent tools (book_table).
   */
  async callTool(
    token: string,
    tool: string,
    args: Record<string, unknown>,
    opts?: { retries?: number }
  ): Promise<McpCallResult> {
    const retries = opts?.retries ?? 2;
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      attempt += 1;
      const res = await this.callToolOnce(token, tool, args);
      if (res.ok || !isRetryable(res.klass ?? "unknown") || attempt > retries) {
        return res;
      }
      const retryAfterMs = res.retryAfterSec !== undefined
        ? Math.max(0, res.retryAfterSec * 1000)
        : backoffMs(attempt);
      await sleep(retryAfterMs);
    }
  }

  private async callToolOnce(
    token: string,
    tool: string,
    args: Record<string, unknown>
  ): Promise<McpCallResult> {
    const { mcpBase } = swiggyDineoutConfig();
    const envelope = buildJsonRpcEnvelope(tool, args, this.nextId++);
    try {
      const res = await axios.post(`${mcpBase}/dineout`, envelope, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          // MCP Streamable HTTP REQUIRES both media types in Accept — the
          // server 406es otherwise ("Client must accept both application/json
          // and text/event-stream"). Verified against the live API 2026-07-18.
          Accept: "application/json, text/event-stream",
        },
        timeout: 15000,
        // Keep the raw body when the server streams SSE back.
        responseType: "text",
        transformResponse: [(d) => d],
      });
      const parsed = parseMcpHttpBody(res.data);
      if (parsed === null) {
        return {
          ok: false,
          klass: "upstream",
          message: "invalid_mcp_response",
          rateLimit: parseRateLimitHeaders(res.headers),
          retryAfterSec: parseRetryAfterSec(res.headers),
        };
      }
      // Unwrap JSON-RPC + MCP content wrapper down to the Swiggy payload
      // ({ success, data, message } | { success:false, error }).
      const body = unwrapToolPayload(parsed);
      const rateLimit = parseRateLimitHeaders(res.headers);
      const deprecation = extractDeprecation(parsed, body);
      const sessionId = extractSessionId(parsed, body, res.headers);
      // JSON-RPC transport-level error object.
      if (parsed?.error?.code !== undefined) {
        return {
          ok: false,
          klass: classifyJsonRpcError(parsed.error.code),
          message: String(parsed.error.message ?? "jsonrpc_error"),
          rateLimit,
          deprecation,
          sessionId,
        };
      }
      if (body?.success === false) {
        const failure = body?.error;
        const klass = classifyToolFailure(body, res.status);
        return {
          ok: false,
          klass,
          message:
            klass === "rate_limited"
              ? RATE_LIMIT_MESSAGE
              : String(
                  typeof failure === "string"
                    ? failure
                    : failure?.message ?? "domain_error"
                ),
          reportLink:
            typeof failure === "object" ? failure?.reportLink : undefined,
          reportHint:
            typeof failure === "object" ? failure?.reportHint : undefined,
          hint:
            body?.hint ??
            (typeof failure === "object" ? failure?.hint : undefined) ??
            body?.data?.hint,
          possibleDuplicateRequest:
            body?.possibleDuplicateRequest ??
            (typeof failure === "object"
              ? failure?.possibleDuplicateRequest
              : undefined),
          identifiers: extractIdentifiers(body),
          envelope: body,
          retryAfterSec: parseRetryAfterSec(res.headers),
          rateLimit,
          deprecation,
          sessionId,
        };
      }
      return {
        ok: true,
        data: unwrapSuccessData(body),
        message: typeof body?.message === "string" ? body.message : undefined,
        hint: typeof body?.hint === "string" ? body.hint : undefined,
        identifiers: extractIdentifiers(body),
        envelope:
          body && typeof body === "object" && !Array.isArray(body)
            ? body
            : undefined,
        rateLimit,
        deprecation,
        sessionId,
      };
    } catch (err: any) {
      const status = err?.response?.status ?? 0;
      // responseType:"text" keeps error bodies raw too — parse before reading.
      const errBody = parseMcpHttpBody(err?.response?.data);
      const jsonRpcCode = errBody?.error?.code;
      const hasToolFailure =
        errBody?.success === false ||
        typeof errBody?.error === "string" ||
        typeof errBody?.error?.code === "string";
      // Gateway auth/revocation/throttle statuses are authoritative. A generic
      // JSON-RPC -32603 body on a 429 must not turn into a retryable internal
      // error and accidentally hammer the active rate limit.
      const authoritativeHttpStatus = [401, 403, 419, 429].includes(status);
      const klass: McpErrorClass = authoritativeHttpStatus
        ? classifyMcpError(status)
        : typeof jsonRpcCode === "number"
          ? classifyJsonRpcError(jsonRpcCode)
          : hasToolFailure
            ? classifyToolFailure(errBody, status)
            : status
            ? classifyMcpError(status)
            : "upstream";
      const retryAfterSec = parseRetryAfterSec(err?.response?.headers);
      const failure = errBody?.error;
      const failureMessage =
        typeof failure === "string" ? failure : failure?.message;
      return {
        ok: false,
        klass,
        message:
          klass === "rate_limited"
            ? RATE_LIMIT_MESSAGE
            : String(failureMessage ?? err?.message ?? "request_failed"),
        reportLink:
          typeof failure === "object" ? failure?.reportLink : undefined,
        reportHint:
          typeof failure === "object" ? failure?.reportHint : undefined,
        hint:
          errBody?.hint ??
          (typeof failure === "object" ? failure?.hint : undefined) ??
          errBody?.data?.hint,
        possibleDuplicateRequest:
          errBody?.possibleDuplicateRequest ??
          (typeof failure === "object"
            ? failure?.possibleDuplicateRequest
            : undefined),
        identifiers: extractIdentifiers(errBody),
        envelope:
          errBody && typeof errBody === "object" && !Array.isArray(errBody)
            ? errBody
            : undefined,
        deprecation: extractDeprecation(errBody, errBody),
        sessionId: extractSessionId(
          errBody,
          errBody,
          err?.response?.headers
        ),
        rateLimit: parseRateLimitHeaders(err?.response?.headers),
        retryAfterSec,
      };
    }
  }
}

let client: SwiggyDineoutClient | null = null;
export const getSwiggyDineoutClient = (): SwiggyDineoutClient => {
  if (!client) client = new SwiggyDineoutClient();
  return client;
};
