import assert from "assert/strict";
import test from "node:test";
import { EnvVars } from "../utils/environment";
import { redisClient } from "../utils/redis";
import { DineoutBookingModel } from "../modules/dineout/schema/swiggy-dineout.schema";
import { DineoutToolsService } from "../modules/dineout/service/dineout-tools.service";

const model = DineoutBookingModel as any;
const originalUpdateOne = model.updateOne;
const originalFindOne = model.findOne;
const originalRedisSet = redisClient.set;
const originalRedisDel = redisClient.del;
const originalRedisEval = redisClient.eval;

const bookingInput = {
  restaurantId: "restaurant-1",
  slotId: 42,
  itemId: "restaurant-1-ticket-7",
  reservationTime: 1_800_000_000,
  guestCount: 2,
  latitude: 12.9716,
  longitude: 77.5946,
  restaurantName: "Test Kitchen",
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
  env.SWIGGY_DINEOUT_REMINDERS_ENABLED = "false";
};

const allowFreshFreeDeal = (service: any) => {
  service.validateFreshFreeDeal = async () => ({
    needsSwiggyAuth: false,
    error: null,
    allowed: true,
  });
};

test.afterEach(() => {
  model.updateOne = originalUpdateOne;
  model.findOne = originalFindOne;
  (redisClient as any).set = originalRedisSet;
  (redisClient as any).del = originalRedisDel;
  (redisClient as any).eval = originalRedisEval;
});

test.after(() => {
  redisClient.disconnect();
});

test("a tampered paid Dineout deal is rejected before book_table", async () => {
  setReady();
  const tools: string[] = [];
  const service = new DineoutToolsService() as any;
  service.connections = { getActiveToken: async () => "token" };
  service.client = {
    callTool: async (_token: string, tool: string) => {
      tools.push(tool);
      if (tool === "get_available_slots") {
        return {
          ok: true,
          data: {
            slots: [
              {
                slotId: bookingInput.slotId,
                reservationTime: bookingInput.reservationTime,
                deals: [
                  {
                    slotId: bookingInput.slotId,
                    itemId: bookingInput.itemId,
                    isFree: false,
                    bookingPrice: 250,
                  },
                ],
              },
            ],
          },
        };
      }
      throw new Error("book_table must not be called for a paid deal");
    },
  };
  let lockAttempts = 0;
  (redisClient as any).set = async () => {
    lockAttempts += 1;
    return "OK";
  };

  const result = await service.bookTable("customer-1", bookingInput);
  assert.match(result.error ?? "", /free|available/i);
  assert.equal(result.booking, null);
  assert.deepEqual(tools, ["get_available_slots"]);
  assert.equal(lockAttempts, 0);
});

test("a confirmed remote booking remains successful when Redis lock cleanup fails", async () => {
  setReady();
  const service = new DineoutToolsService() as any;
  allowFreshFreeDeal(service);
  service.connections = { getActiveToken: async () => "token" };
  service.client = {
    callTool: async () => ({
      ok: true,
      data: {
        orderId: "order-confirmed-1",
        status: "CONFIRMED",
        restaurantName: "Test Kitchen",
        guestCount: 2,
      },
    }),
  };
  (redisClient as any).set = async () => "OK";
  (redisClient as any).del = async () => {
    throw new Error("redis unavailable during cleanup");
  };
  (redisClient as any).eval = async () => {
    throw new Error("redis unavailable during cleanup");
  };
  model.updateOne = async () => ({ acknowledged: true });

  const result = await service.bookTable("customer-1", bookingInput);
  assert.equal(result.error, null);
  assert.equal(result.confirming, false);
  assert.equal(result.booking?.orderId, "order-confirmed-1");
});

test("booking cleanup cannot delete a lock acquired by a newer request", async () => {
  setReady();
  let lockOwner: string | undefined;
  const service = new DineoutToolsService() as any;
  allowFreshFreeDeal(service);
  service.connections = { getActiveToken: async () => "token" };
  (redisClient as any).set = async (
    _key: string,
    owner: string
  ) => {
    lockOwner = owner;
    return "OK";
  };
  service.client = {
    callTool: async () => {
      // Simulate the original 60-second lock expiring and a newer request
      // acquiring the same key while the first request is still finishing.
      lockOwner = "new-owner";
      return {
        ok: true,
        data: { orderId: "order-confirmed-2", status: "CONFIRMED" },
      };
    },
  };
  (redisClient as any).del = async () => {
    lockOwner = undefined;
    return 1;
  };
  (redisClient as any).eval = async (
    _script: string,
    _keyCount: number,
    _key: string,
    expectedOwner: string
  ) => {
    if (lockOwner === expectedOwner) {
      lockOwner = undefined;
      return 1;
    }
    return 0;
  };
  model.updateOne = async () => ({ acknowledged: true });

  const result = await service.bookTable("customer-1", bookingInput);
  assert.equal(result.booking?.orderId, "order-confirmed-2");
  assert.equal(lockOwner, "new-owner");
});

test("a documented duplicate failure reconciles only through a known local order id", async () => {
  setReady();
  const called: Array<{ tool: string; args: Record<string, unknown> }> = [];
  const service = new DineoutToolsService() as any;
  allowFreshFreeDeal(service);
  service.connections = { getActiveToken: async () => "token" };
  service.client = {
    callTool: async (
      _token: string,
      tool: string,
      args: Record<string, unknown>
    ) => {
      called.push({ tool, args });
      if (tool === "book_table") {
        return {
          ok: false,
          klass: "bad_input",
          message: "deal already purchased",
          possibleDuplicateRequest: true,
        };
      }
      return {
        ok: true,
        data: { orderId: "known-order-1", status: "CONFIRMED" },
      };
    },
  };
  (redisClient as any).set = async () => "OK";
  (redisClient as any).del = async () => 1;
  (redisClient as any).eval = async () => 1;
  model.findOne = () => ({
    sort: () => ({
      lean: async () => ({
        swiggyOrderId: "known-order-1",
        restaurantName: "Test Kitchen",
        reservationTime: new Date(bookingInput.reservationTime * 1000),
        guestCount: 2,
        status: "CONFIRMED",
      }),
    }),
  });
  model.updateOne = async () => ({ acknowledged: true });

  const result = await service.bookTable("customer-1", bookingInput);
  assert.equal(result.error, null);
  assert.equal(result.confirming, false);
  assert.equal(result.booking?.orderId, "known-order-1");
  assert.deepEqual(called, [
    {
      tool: "book_table",
      args: {
        restaurantId: "restaurant-1",
        slotId: 42,
        itemId: "restaurant-1-ticket-7",
        reservationTime: 1_800_000_000,
        guestCount: 2,
        latitude: 12.9716,
        longitude: 77.5946,
      },
    },
    { tool: "get_booking_status", args: { orderId: "known-order-1" } },
  ]);
});

test("a duplicate remains confirming when the local reconciliation ledger is unavailable", async () => {
  setReady();
  const service = new DineoutToolsService() as any;
  allowFreshFreeDeal(service);
  service.connections = { getActiveToken: async () => "token" };
  service.client = {
    callTool: async () => ({
      ok: false,
      klass: "bad_input",
      message: "deal already purchased",
      possibleDuplicateRequest: true,
    }),
  };
  (redisClient as any).set = async () => "OK";
  (redisClient as any).del = async () => 1;
  (redisClient as any).eval = async () => 1;
  model.findOne = (): any => ({
    sort: () => ({
      lean: async () => {
        throw new Error("booking ledger unavailable");
      },
    }),
  });

  const result = await service.bookTable("customer-1", bookingInput);
  assert.deepEqual(result, {
    needsSwiggyAuth: false,
    error: null,
    confirming: true,
    booking: null,
  });
});

test("a reconciled duplicate repairs the successful-booking ledger", async () => {
  setReady();
  const writes: Array<{ update: any; options: any }> = [];
  const service = new DineoutToolsService() as any;
  allowFreshFreeDeal(service);
  service.connections = { getActiveToken: async () => "token" };
  service.client = {
    callTool: async (
      _token: string,
      tool: string
    ): Promise<any> =>
      tool === "book_table"
        ? {
            ok: false,
            klass: "domain",
            message: "deal already purchased",
            possibleDuplicateRequest: true,
            identifiers: { orderId: "remote-order-1" },
          }
        : {
            ok: true,
            data: {
              orderId: "remote-order-1",
              status: "CONFIRMED",
              restaurantName: "Test Kitchen",
              guestCount: 2,
            },
          },
  };
  (redisClient as any).set = async () => "OK";
  (redisClient as any).del = async () => 1;
  (redisClient as any).eval = async () => 1;
  model.findOne = () => {
    throw new Error("remote order id should avoid an ambiguous ledger lookup");
  };
  model.updateOne = async (
    _filter: unknown,
    update: any,
    options: any
  ) => {
    writes.push({ update, options });
    return { acknowledged: true };
  };

  const result = await service.bookTable("customer-1", bookingInput);
  assert.equal(result.booking?.orderId, "remote-order-1");
  assert.equal(
    writes.some(
      (write) =>
        write.options?.upsert === true &&
        write.update?.$setOnInsert?.swiggyOrderId === "remote-order-1"
    ),
    true
  );
});

test("an ambiguous booking response with an order id is reconciled before returning", async () => {
  setReady();
  const called: string[] = [];
  const service = new DineoutToolsService() as any;
  allowFreshFreeDeal(service);
  service.connections = { getActiveToken: async () => "token" };
  service.client = {
    callTool: async (_token: string, tool: string) => {
      called.push(tool);
      return tool === "book_table"
        ? {
            ok: false,
            klass: "upstream",
            message: "connection dropped",
            identifiers: { orderId: "ambiguous-order-1" },
          }
        : {
            ok: true,
            data: { orderId: "ambiguous-order-1", status: "CONFIRMED" },
          };
    },
  };
  (redisClient as any).set = async () => "OK";
  (redisClient as any).eval = async () => 1;
  model.updateOne = async () => ({ acknowledged: true });

  const result = await service.bookTable("customer-1", bookingInput);
  assert.equal(result.confirming, false);
  assert.equal(result.booking?.orderId, "ambiguous-order-1");
  assert.deepEqual(called, ["book_table", "get_booking_status"]);
});

test("an opaque ambiguous booking retains the submit lock for fifteen minutes", async () => {
  setReady();
  const evalCalls: Array<{ script: string; args: unknown[] }> = [];
  const service = new DineoutToolsService() as any;
  allowFreshFreeDeal(service);
  service.connections = { getActiveToken: async () => "token" };
  service.client = {
    callTool: async () => ({
      ok: false,
      klass: "upstream",
      message: "network timeout",
    }),
  };
  (redisClient as any).set = async () => "OK";
  (redisClient as any).eval = async (script: string, ...args: unknown[]) => {
    evalCalls.push({ script, args });
    return 1;
  };

  const result = await service.bookTable("customer-1", bookingInput);
  assert.equal(result.confirming, true);
  assert.equal(evalCalls.length, 1);
  assert.match(evalCalls[0].script, /expire/i);
  assert.equal(evalCalls[0].args.at(-1), 15 * 60);
});

test("an opaque duplicate or network outcome never invents an order id", async (t) => {
  setReady();
  for (const failure of [
    {
      name: "duplicate without a known local booking",
      response: {
        ok: false,
        klass: "bad_input",
        message: "deal already purchased",
        possibleDuplicateRequest: true,
      },
    },
    {
      name: "opaque upstream failure",
      response: { ok: false, klass: "upstream", message: "network timeout" },
    },
  ]) {
    await t.test(failure.name, async () => {
      const service = new DineoutToolsService() as any;
      allowFreshFreeDeal(service);
      service.connections = { getActiveToken: async () => "token" };
      service.client = { callTool: async () => failure.response };
      (redisClient as any).set = async () => "OK";
      (redisClient as any).del = async () => 1;
      (redisClient as any).eval = async () => 1;
      model.findOne = (): any => ({
        sort: () => ({ lean: async (): Promise<any> => null }),
      });

      const result = await service.bookTable("customer-1", bookingInput);
      assert.equal(result.error, null);
      assert.equal(result.confirming, true);
      assert.equal(result.booking, null);
    });
  }
});
