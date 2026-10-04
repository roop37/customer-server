import assert from "assert/strict";
import axios from "axios";
import {
  buildJsonRpcEnvelope,
  classifyMcpError,
  classifyJsonRpcError,
  isRetryable,
  backoffMs,
  buildBookingDedupeKey,
  toSearchCoords,
  getSwiggyDineoutClient,
} from "../utils/swiggy-dineout.client";

// JSON-RPC 2.0 envelope shape.
(() => {
  const env = buildJsonRpcEnvelope(
    "search_restaurants_dineout",
    { query: "rooftop" },
    7
  );
  assert.equal(env.jsonrpc, "2.0");
  assert.equal(env.method, "tools/call");
  assert.equal(env.id, 7);
  assert.equal(env.params.name, "search_restaurants_dineout");
  assert.deepEqual(env.params.arguments, { query: "rooftop" });
})();

// Error classification by HTTP status.
(() => {
  assert.equal(classifyMcpError(401), "auth");
  assert.equal(classifyMcpError(419), "revoked");
  assert.equal(classifyMcpError(403), "auth");
  assert.equal(classifyMcpError(400), "bad_input");
  assert.equal(classifyMcpError(503), "upstream");
  assert.equal(classifyMcpError(500), "internal");
})();

// Error classification by JSON-RPC transport code.
(() => {
  assert.equal(classifyJsonRpcError(-32001), "auth");
  assert.equal(classifyJsonRpcError(-32603), "internal");
  assert.equal(classifyJsonRpcError(-1), "unknown");
})();

// Retry policy: transient 5xx/upstream failures retry; a rate-limit response
// stops this call so the caller can honour the server-provided retry window.
(() => {
  assert.equal(isRetryable("upstream"), true);
  assert.equal(isRetryable("internal"), true);
  assert.equal(isRetryable("rate_limited"), false);
  assert.equal(isRetryable("auth"), false);
  assert.equal(isRetryable("revoked"), false);
  assert.equal(isRetryable("bad_input"), false);
})();

// Backoff grows and is bounded.
(() => {
  assert.ok(backoffMs(1) >= 500 && backoffMs(1) <= 650);
  assert.ok(backoffMs(2) >= 1000 && backoffMs(2) <= 1300);
  assert.ok(backoffMs(10) <= 8000, "capped");
})();

// Dedupe key is stable for the same booking tuple.
(() => {
  const a = buildBookingDedupeKey({
    customerId: "c1",
    restaurantId: "r1",
    slotId: 5,
  });
  const b = buildBookingDedupeKey({
    customerId: "c1",
    restaurantId: "r1",
    slotId: 5,
  });
  const c = buildBookingDedupeKey({
    customerId: "c1",
    restaurantId: "r1",
    slotId: 6,
  });
  assert.equal(a, b, "same tuple => same key");
  assert.notEqual(a, c, "different slot => different key");
  assert.ok(a.startsWith("swiggy:book:"));
})();

// Coordinate swap: Hoizr GeoJSON [lng,lat] => Swiggy { lat, lng }.
(() => {
  const out = toSearchCoords([77.5946, 12.9716]);
  assert.equal(out.lat, 12.9716);
  assert.equal(out.lng, 77.5946);
})();

// Dineout's documented free-booking failure uses a plain-string `error`.
// It is a domain failure, not malformed input, and the text must survive.
const plainStringDomainFailure = async (): Promise<void> => {
  const originalPost = axios.post;
  try {
    (axios.post as any) = async () => ({
      data: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: {
          structuredContent: {
            success: false,
            booking: null,
            error: "deal already purchased",
          },
        },
      }),
      headers: {},
      status: 200,
    });

    const result = await getSwiggyDineoutClient().callTool(
      "token",
      "book_table",
      {},
      { retries: 0 }
    );
    assert.equal(result.ok, false);
    assert.equal(result.klass, "domain");
    assert.equal(result.message, "deal already purchased");
  } finally {
    (axios.post as any) = originalPost;
  }
};

// Failure context used for duplicate reconciliation must not be discarded.
const duplicateFailureMetadata = async (): Promise<void> => {
  const originalPost = axios.post;
  try {
    (axios.post as any) = async () => ({
      data: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        result: {
          structuredContent: {
            success: false,
            booking: null,
            bookingId: "BOOK-42",
            error: {
              message: "booking may already exist",
              orderId: "ORDER-42",
              reportLink: "https://mcp.swiggy.com/report/42",
              reportHint: "Share this report with support",
            },
            hint: "Check booking status before retrying",
            possibleDuplicateRequest: true,
          },
        },
      }),
      headers: {},
      status: 200,
    });

    const result: any = await getSwiggyDineoutClient().callTool(
      "token",
      "book_table",
      {},
      { retries: 0 }
    );
    assert.equal(result.message, "booking may already exist");
    assert.equal(result.hint, "Check booking status before retrying");
    assert.equal(result.possibleDuplicateRequest, true);
    assert.deepEqual(result.identifiers, {
      orderId: "ORDER-42",
      bookingId: "BOOK-42",
    });
    assert.equal(result.reportLink, "https://mcp.swiggy.com/report/42");
    assert.equal(result.reportHint, "Share this report with support");
    assert.equal(result.envelope.bookingId, "BOOK-42");
  } finally {
    (axios.post as any) = originalPost;
  }
};

// Every documented Dineout success container maps to `data`, while the
// human-readable and forward-compatible envelope remains available.
const successEnvelopeAliases = async (): Promise<void> => {
  const originalPost = axios.post;
  try {
    const cases = [
      { key: "data", value: { orderId: "ORDER-DATA" } },
      { key: "order", value: { orderId: "ORDER-ALIAS" } },
      { key: "booking", value: { orderId: "BOOKING-ALIAS" } },
      { key: "cart", value: { cartKey: "CART-ALIAS" } },
    ] as const;

    for (const testCase of cases) {
      (axios.post as any) = async () => ({
        data: JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          result: {
            structuredContent: {
              success: true,
              [testCase.key]: testCase.value,
              message: `success via ${testCase.key}`,
            },
          },
        }),
        headers: {},
        status: 200,
      });

      const result: any = await getSwiggyDineoutClient().callTool(
        "token",
        "get_booking_status",
        {},
        { retries: 0 }
      );
      assert.equal(result.ok, true);
      assert.deepEqual(result.data, testCase.value, testCase.key);
      assert.deepEqual(result.envelope, {
        success: true,
        [testCase.key]: testCase.value,
        message: `success via ${testCase.key}`,
      });
    }
  } finally {
    (axios.post as any) = originalPost;
  }
};

// HTTP 200 is only a transport success. Tool failures still need their
// documented domain/auth/upstream/input classification.
const http200FailureClasses = async (): Promise<void> => {
  const originalPost = axios.post;
  try {
    const cases = [
      {
        error: { code: "RATE_LIMITED", message: "Too many requests" },
        expected: "rate_limited",
      },
      { error: "RATE_LIMITED: quota exhausted", expected: "rate_limited" },
      {
        error: { message: "Unauthenticated session: token expired" },
        expected: "auth",
      },
      { error: "upstream request timed out", expected: "upstream" },
      {
        error: { code: "INTERNAL_ERROR", message: "unexpected failure" },
        expected: "internal",
      },
      {
        error: { code: "VALIDATION_ERROR", message: "Invalid guestCount" },
        expected: "bad_input",
      },
      {
        error: { code: "SLOT_UNAVAILABLE", message: "Invalid slot selection" },
        expected: "domain",
      },
      { error: "slot is no longer available", expected: "domain" },
    ] as const;

    for (const testCase of cases) {
      let calls = 0;
      (axios.post as any) = async () => {
        calls += 1;
        return {
          data: JSON.stringify({
            jsonrpc: "2.0",
            id: 4,
            result: {
              structuredContent: {
                success: false,
                error: testCase.error,
              },
            },
          }),
          headers: {},
          status: 200,
        };
      };

      const result = await getSwiggyDineoutClient().callTool(
        "token",
        "get_available_slots",
        {},
        { retries: testCase.expected === "rate_limited" ? 2 : 0 }
      );
      assert.equal(result.klass, testCase.expected, JSON.stringify(testCase.error));
      if (testCase.expected === "rate_limited") {
        assert.equal(calls, 1, "RATE_LIMITED is not auto-retried");
      }
    }
  } finally {
    (axios.post as any) = originalPost;
  }
};

// Retry-After is the server's wait window, not an exponential-backoff value;
// it must not be truncated to the client's ordinary 8-second backoff cap.
const retryAfterIsHonoured = async (): Promise<void> => {
  const originalPost = axios.post;
  const originalSetTimeout = global.setTimeout;
  const delays: number[] = [];
  let calls = 0;
  try {
    (global as any).setTimeout = (callback: () => void, delay: number) => {
      delays.push(delay);
      callback();
      return 0;
    };
    (axios.post as any) = async () => {
      calls += 1;
      if (calls === 1) {
        throw {
          message: "Request failed with status code 503",
          response: {
            status: 503,
            headers: { "retry-after": "23" },
            data: JSON.stringify({
              success: false,
              error: { message: "upstream unavailable" },
            }),
          },
        };
      }
      return {
        data: JSON.stringify({
          jsonrpc: "2.0",
          id: 5,
          result: { structuredContent: { success: true, data: { ok: true } } },
        }),
        headers: {},
        status: 200,
      };
    };

    const result = await getSwiggyDineoutClient().callTool(
      "token",
      "get_restaurant_details",
      {},
      { retries: 1 }
    );
    assert.equal(result.ok, true);
    assert.equal(calls, 2);
    assert.deepEqual(delays, [23_000]);
  } finally {
    (axios.post as any) = originalPost;
    (global as any).setTimeout = originalSetTimeout;
  }
};

// RATE_LIMITED can arrive inside an HTTP-200 tool envelope. Return its retry
// window to the caller and do not replay the tool automatically.
const domainRateLimitStopsImmediately = async (): Promise<void> => {
  const originalPost = axios.post;
  let calls = 0;
  try {
    (axios.post as any) = async () => {
      calls += 1;
      return {
        data: JSON.stringify({
          jsonrpc: "2.0",
          id: 6,
          result: {
            structuredContent: {
              success: false,
              error: { code: "RATE_LIMITED", message: "Too many requests" },
            },
          },
        }),
        headers: { "retry-after": "31" },
        status: 200,
      };
    };

    const result = await getSwiggyDineoutClient().callTool(
      "token",
      "get_saved_locations",
      {},
      { retries: 3 }
    );
    assert.equal(result.klass, "rate_limited");
    assert.equal(
      result.message,
      "Swiggy is a little busy right now — give it a few seconds and try again."
    );
    assert.equal(result.retryAfterSec, 31);
    assert.equal(calls, 1);
  } finally {
    (axios.post as any) = originalPost;
  }
};

const http429StopsImmediately = async (): Promise<void> => {
  const originalPost = axios.post;
  let calls = 0;
  try {
    (axios.post as any) = async () => {
      calls += 1;
      throw {
        message: "Request failed with status code 429",
        response: {
          status: 429,
          headers: { "Retry-After": "47" },
          data: JSON.stringify({
            success: false,
            error: { message: "Rate limit exceeded" },
          }),
        },
      };
    };

    const result = await getSwiggyDineoutClient().callTool(
      "token",
      "get_saved_locations",
      {},
      { retries: 3 }
    );
    assert.equal(result.klass, "rate_limited");
    assert.equal(result.message, "Swiggy is a little busy right now — give it a few seconds and try again.");
    assert.equal(result.retryAfterSec, 47);
    assert.equal(calls, 1);
  } finally {
    (axios.post as any) = originalPost;
  }
};

// The HTTP gateway status is authoritative even if the JSON-RPC body carries
// a generic internal code. In particular, a 429 must never enter the retry
// loop and a 419 must force reauthentication.
const httpStatusWinsOverJsonRpcCode = async (): Promise<void> => {
  const originalPost = axios.post;
  try {
    for (const testCase of [
      { status: 429, expected: "rate_limited" },
      { status: 419, expected: "revoked" },
      { status: 401, expected: "auth" },
    ] as const) {
      let calls = 0;
      (axios.post as any) = async () => {
        calls += 1;
        throw {
          response: {
            status: testCase.status,
            headers: { "Retry-After": "9" },
            data: JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32603, message: "generic internal error" },
            }),
          },
        };
      };
      const result = await getSwiggyDineoutClient().callTool(
        "token",
        "get_saved_locations",
        {},
        { retries: 2 }
      );
      assert.equal(result.klass, testCase.expected);
      assert.equal(calls, 1);
    }
  } finally {
    (axios.post as any) = originalPost;
  }
};

const malformedSuccessBodyFailsClosed = async (): Promise<void> => {
  const originalPost = axios.post;
  try {
    (axios.post as any) = async () => ({
      data: "not json and not an SSE frame",
      headers: {},
      status: 200,
    });
    const result = await getSwiggyDineoutClient().callTool(
      "token",
      "get_saved_locations",
      {},
      { retries: 0 }
    );
    assert.equal(result.ok, false);
    assert.equal(result.klass, "upstream");
    assert.equal(result.message, "invalid_mcp_response");
  } finally {
    (axios.post as any) = originalPost;
  }
};

// Successful responses expose the active quota and forward-compatible Swiggy
// deprecation signal without changing the existing `data` payload.
const successObservabilityMetadata = async (): Promise<void> => {
  const originalPost = axios.post;
  try {
    (axios.post as any) = async () => ({
      data: JSON.stringify({
        jsonrpc: "2.0",
        id: 7,
        result: {
          structuredContent: {
            success: true,
            data: { locations: [] },
            message: "No saved locations",
          },
          _meta: {
            "swiggy.deprecation": {
              tool: "get_saved_locations",
              replaced_by: "list_saved_locations",
              remove_after: "2027-02-01",
            },
          },
        },
      }),
      headers: {
        "Mcp-Session-Id": "swiggy-session-7",
        "X-RateLimit-Limit": "70",
        "x-ratelimit-remaining": "69",
        "X-RATELIMIT-RESET": "1790812800",
      },
      status: 200,
    });

    const result: any = await getSwiggyDineoutClient().callTool(
      "token",
      "get_saved_locations",
      {},
      { retries: 0 }
    );
    assert.deepEqual(result.data, { locations: [] });
    assert.deepEqual(result.rateLimit, {
      limit: 70,
      remaining: 69,
      reset: 1790812800,
    });
    assert.deepEqual(result.deprecation, {
      tool: "get_saved_locations",
      replaced_by: "list_saved_locations",
      remove_after: "2027-02-01",
    });
    assert.equal(result.sessionId, "swiggy-session-7");
  } finally {
    (axios.post as any) = originalPost;
  }
};

// Axios rejects non-2xx responses, but they use the same string/object failure
// envelope and must retain reconciliation context too.
const httpErrorStringEnvelope = async (): Promise<void> => {
  const originalPost = axios.post;
  try {
    (axios.post as any) = async () => {
      throw {
        message: "Request failed with status code 400",
        response: {
          status: 400,
          headers: {},
          data: JSON.stringify({
            success: false,
            error: "Missing guestCount",
            hint: "Choose between 1 and 20 guests",
            orderId: "ORDER-HTTP-400",
            possibleDuplicateRequest: true,
          }),
        },
      };
    };

    const result: any = await getSwiggyDineoutClient().callTool(
      "token",
      "book_table",
      {},
      { retries: 0 }
    );
    assert.equal(result.klass, "bad_input");
    assert.equal(result.message, "Missing guestCount");
    assert.equal(result.hint, "Choose between 1 and 20 guests");
    assert.equal(result.possibleDuplicateRequest, true);
    assert.deepEqual(result.identifiers, { orderId: "ORDER-HTTP-400" });
    assert.equal(result.envelope.orderId, "ORDER-HTTP-400");
  } finally {
    (axios.post as any) = originalPost;
  }
};

Promise.resolve()
  .then(plainStringDomainFailure)
  .then(duplicateFailureMetadata)
  .then(successEnvelopeAliases)
  .then(http200FailureClasses)
  .then(retryAfterIsHonoured)
  .then(domainRateLimitStopsImmediately)
  .then(http429StopsImmediately)
  .then(httpStatusWinsOverJsonRpcCode)
  .then(malformedSuccessBodyFailsClosed)
  .then(successObservabilityMetadata)
  .then(httpErrorStringEnvelope)
  .then(() => console.log("swiggy-mcp-client.test.ts passed"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
