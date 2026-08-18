import "reflect-metadata";
import assert from "assert/strict";
import test from "node:test";
import { EnvVars } from "../utils/environment";
import { redisClient } from "../utils/redis";
import { DineoutBookingModel } from "../modules/dineout/schema/swiggy-dineout.schema";
import { SwiggyDineoutResolver } from "../modules/dineout/resolver/swiggy-dineout.resolver";
import { DineoutToolsService } from "../modules/dineout/service/dineout-tools.service";
import { registerSwiggyOAuth } from "../routes/swiggy-oauth.route";

const DISABLED = "Swiggy Dineout is currently unavailable.";
const originalRedisGet = redisClient.get;
const originalRedisSet = redisClient.set;
const originalRedisDel = redisClient.del;
const bookingModel = DineoutBookingModel as any;
const originalBookingFind = bookingModel.find;

const setDisabled = () => {
  (EnvVars.values as any).SWIGGY_DINEOUT_ENABLED = "false";
};

const setReady = () => {
  const env = EnvVars.values as any;
  env.SWIGGY_DINEOUT_ENABLED = "true";
  env.SWIGGY_CLIENT_ID = "hoizr-client";
  env.SWIGGY_OAUTH_REDIRECT_URI =
    "https://orderapi.hoizr.com/auth/swiggy/callback";
  env.SWIGGY_FRONTEND_RETURN = "https://hoizr.com/me/profile";
  env.SWIGGY_MCP_BASE = "https://mcp.swiggy.com";
  env.SWIGGY_TOKEN_ENCRYPTION_KEY = "a".repeat(64);
  env.SERVER_ENV = "production";
};

test.afterEach(() => {
  (redisClient as any).get = originalRedisGet;
  (redisClient as any).set = originalRedisSet;
  (redisClient as any).del = originalRedisDel;
  bookingModel.find = originalBookingFind;
});

test.after(async () => {
  redisClient.disconnect();
});

test("the disabled feature gate blocks every GraphQL data path", async () => {
  setDisabled();
  let connectionReads = 0;
  let toolCalls = 0;
  const resolver = new SwiggyDineoutResolver() as any;
  resolver.connections = {
    getStatus: async () => {
      connectionReads += 1;
      return { connected: true };
    },
  };
  resolver.tools = new Proxy(
    {},
    {
      get: () => async (): Promise<any> => {
        toolCalls += 1;
        return {
          needsSwiggyAuth: false,
          error: null,
          data: [],
          confirming: false,
          booking: null,
          reportLink: null,
          message: null,
        };
      },
    }
  );
  const ctx = { customerId: "customer-1" } as any;

  assert.deepEqual(await resolver.swiggyDineoutStatus(ctx), {
    connected: false,
  });
  assert.deepEqual(
    await resolver.searchDineoutRestaurants(ctx, { query: "bar" }),
    { needsSwiggyAuth: false, error: DISABLED, restaurants: [] }
  );
  assert.deepEqual(
    await resolver.dineoutRestaurantDetails(ctx, {
      restaurantId: "r1",
      latitude: 12,
      longitude: 77,
    }),
    { needsSwiggyAuth: false, error: DISABLED }
  );
  assert.deepEqual(
    await resolver.dineoutAvailableSlots(ctx, {
      restaurantId: "r1",
      date: "2026-08-18",
      latitude: 12,
      longitude: 77,
    }),
    { needsSwiggyAuth: false, error: DISABLED, slotGroups: [] }
  );
  assert.deepEqual(await resolver.dineoutSavedLocations(ctx), {
    needsSwiggyAuth: false,
    error: DISABLED,
    locations: [],
  });
  assert.deepEqual(
    await resolver.dineoutTonightRail(ctx, {
      city: "Bengaluru",
      latitude: 12,
      longitude: 77,
    }),
    { needsSwiggyAuth: false, error: DISABLED, restaurants: [] }
  );
  assert.deepEqual(
    await resolver.bookDineoutTable(ctx, {
      restaurantId: "r1",
      slotId: 1,
      itemId: "r1-ticket-1",
      reservationTime: 1_800_000_000,
      guestCount: 2,
      latitude: 12,
      longitude: 77,
    }),
    {
      needsSwiggyAuth: false,
      confirming: false,
      error: DISABLED,
    }
  );
  assert.deepEqual(await resolver.dineoutBookingStatus(ctx, "order-1"), {
    needsSwiggyAuth: false,
    error: DISABLED,
  });
  assert.deepEqual(await resolver.myDineoutBookings(ctx), []);
  assert.deepEqual(
    await resolver.reportDineoutError(ctx, {
      tool: "book_table",
      errorMessage: "failed",
    }),
    { needsSwiggyAuth: false, error: DISABLED }
  );
  assert.equal(connectionReads, 0);
  assert.equal(toolCalls, 0);
});

test("disconnect remains available while disabled as the remote-revocation safety exception", async () => {
  setDisabled();
  let disconnects = 0;
  const resolver = new SwiggyDineoutResolver() as any;
  resolver.connections = {
    disconnect: async () => {
      disconnects += 1;
    },
  };

  assert.equal(
    await resolver.disconnectSwiggy({ customerId: "customer-1" } as any),
    true
  );
  assert.equal(disconnects, 1);
});

test("the disabled feature gate blocks every tools-service path before auth, cache, or database access", async () => {
  setDisabled();
  let connectionReads = 0;
  let clientCalls = 0;
  let redisCalls = 0;
  let bookingReads = 0;
  const service = new DineoutToolsService() as any;
  service.connections = {
    getActiveToken: async () => {
      connectionReads += 1;
      return "token";
    },
  };
  service.client = {
    callTool: async (): Promise<any> => {
      clientCalls += 1;
      return { ok: true, data: [] };
    },
  };
  (redisClient as any).get = async (): Promise<any> => {
    redisCalls += 1;
    return null;
  };
  (redisClient as any).set = async () => {
    redisCalls += 1;
    return "OK";
  };
  (redisClient as any).del = async () => {
    redisCalls += 1;
    return 1;
  };
  bookingModel.find = (): any => {
    bookingReads += 1;
    return { sort: () => ({ lean: async (): Promise<any[]> => [] }) };
  };

  const results = await Promise.all([
    service.searchRestaurants("customer-1", { query: "bar" }),
    service.getRestaurantDetails("customer-1", {
      restaurantId: "r1",
      latitude: 12,
      longitude: 77,
    }),
    service.getAvailableSlots("customer-1", {
      restaurantId: "r1",
      date: "2026-08-18",
      latitude: 12,
      longitude: 77,
    }),
    service.getSavedLocations("customer-1"),
    service.railTonight("customer-1", {
      city: "Bengaluru",
      latitude: 12,
      longitude: 77,
    }),
    service.bookTable("customer-1", {
      restaurantId: "r1",
      slotId: 1,
      itemId: "r1-ticket-1",
      reservationTime: 1_800_000_000,
      guestCount: 2,
      latitude: 12,
      longitude: 77,
    }),
    service.getBookingStatus("customer-1", "order-1"),
    service.reportError("customer-1", {
      tool: "book_table",
      errorMessage: "failed",
    }),
  ]);

  for (const result of results) {
    assert.equal(result.error, DISABLED);
  }
  assert.deepEqual(await service.myBookings("customer-1"), []);
  assert.equal(connectionReads, 0);
  assert.equal(clientCalls, 0);
  assert.equal(redisCalls, 0);
  assert.equal(bookingReads, 0);
});

test("a shared rail cache hit cannot bypass the requesting customer's current connection", async () => {
  setReady();
  let cacheReads = 0;
  const service = new DineoutToolsService() as any;
  service.connections = {
    getActiveToken: async (): Promise<string | null> => null,
  };
  (redisClient as any).get = async () => {
    cacheReads += 1;
    return JSON.stringify([{ restaurantId: "cached-r1" }]);
  };

  const result = await service.railTonight("customer-1", {
    city: "Bengaluru",
    latitude: 12,
    longitude: 77,
  });
  assert.deepEqual(result, {
    needsSwiggyAuth: true,
    error: null,
    data: null,
  });
  assert.equal(cacheReads, 0);
});

test("a 419-class tool response records REVOKED rather than EXPIRED", async () => {
  setReady();
  let expired = 0;
  let revoked = 0;
  const service = new DineoutToolsService() as any;
  service.connections = {
    getActiveToken: async () => "token",
    markExpired: async () => {
      expired += 1;
    },
    markRevoked: async () => {
      revoked += 1;
    },
  };
  service.client = {
    callTool: async () => ({ ok: false, klass: "revoked", message: "revoked" }),
  };

  const result = await service.getRestaurantDetails("customer-1", {
    restaurantId: "r1",
    latitude: 12,
    longitude: 77,
  });
  assert.equal(result.needsSwiggyAuth, true);
  assert.equal(revoked, 1);
  assert.equal(expired, 0);
});

test("the OAuth callback is kill-switched before consuming state or exchanging a code", async () => {
  setDisabled();
  const routes = new Map<string, Function>();
  registerSwiggyOAuth({
    get: (path: string, handler: Function) => routes.set(path, handler),
  } as any);
  let statusCode: number | undefined;
  let payload: unknown;
  let redirected = false;
  const reply = {
    code(code: number) {
      statusCode = code;
      return this;
    },
    send(body: unknown) {
      payload = body;
      return this;
    },
    redirect() {
      redirected = true;
      return this;
    },
  };

  await routes.get("/auth/swiggy/callback")!(
    { query: { error: "access_denied" } },
    reply
  );
  assert.equal(statusCode, 503);
  assert.equal(redirected, false);
  assert.deepEqual(payload, { error: DISABLED });
});
