import assert from "assert/strict";
import test from "node:test";
import axios from "axios";
import { SwiggyConnectionStatus } from "@hoizr-technology/shared";
import { EnvVars } from "../utils/environment";
import { SwiggyDineoutConnectionModel } from "../modules/dineout/schema/swiggy-dineout.schema";
import { SwiggyConnectionService } from "../modules/dineout/service/swiggy-connection.service";
import { encryptSwiggyToken } from "../modules/dineout/util/token-crypto";

const model = SwiggyDineoutConnectionModel as any;
const originalFindOne = model.findOne;
const originalUpdateOne = model.updateOne;
const originalDeleteOne = model.deleteOne;
const originalAxiosPost = axios.post;

const setReadyConfig = () => {
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
  model.findOne = originalFindOne;
  model.updateOne = originalUpdateOne;
  model.deleteOne = originalDeleteOne;
  (axios as any).post = originalAxiosPost;
});

test("a token with exactly 60 seconds remaining needs reauthentication", async () => {
  setReadyConfig();
  const now = 1_800_000_000_000;
  const originalNow = Date.now;
  Date.now = () => now;
  let markedStatus: SwiggyConnectionStatus | undefined;
  model.findOne = () => ({
    lean: async () => ({
      status: SwiggyConnectionStatus.CONNECTED,
      tokenExpiresAt: new Date(now + 60_000),
      encryptedAccessToken: "not-needed-at-the-expiry-boundary",
    }),
  });
  model.updateOne = async (_filter: unknown, update: any) => {
    markedStatus = update.$set.status;
  };

  try {
    const token = await new SwiggyConnectionService().getActiveToken("customer-1");
    assert.equal(token, null);
    assert.equal(markedStatus, SwiggyConnectionStatus.EXPIRED);
  } finally {
    Date.now = originalNow;
  }
});

test("connection status is not connected inside the 60-second reauth window", async () => {
  setReadyConfig();
  const now = 1_800_000_000_000;
  const originalNow = Date.now;
  Date.now = () => now;
  model.findOne = () => ({
    lean: async () => ({
      status: SwiggyConnectionStatus.CONNECTED,
      tokenExpiresAt: new Date(now + 60_000),
    }),
  });
  let markedStatus: SwiggyConnectionStatus | undefined;
  model.updateOne = async (_filter: unknown, update: any) => {
    markedStatus = update.$set.status;
  };

  try {
    const status = await new SwiggyConnectionService().getStatus("customer-1");
    assert.equal(status.connected, false);
    assert.equal(status.status, SwiggyConnectionStatus.EXPIRED);
    assert.equal(markedStatus, SwiggyConnectionStatus.EXPIRED);
  } finally {
    Date.now = originalNow;
  }
});

test("connection status is not connected when the stored token cannot be decrypted", async () => {
  setReadyConfig();
  let markedStatus: SwiggyConnectionStatus | undefined;
  model.findOne = () => ({
    lean: async () => ({
      status: SwiggyConnectionStatus.CONNECTED,
      tokenExpiresAt: new Date(Date.now() + 120_000),
      encryptedAccessToken: "corrupt-envelope",
    }),
  });
  model.updateOne = async (_filter: unknown, update: any) => {
    markedStatus = update.$set.status;
  };

  const status = await new SwiggyConnectionService().getStatus("customer-1");
  assert.equal(status.connected, false);
  assert.equal(status.status, SwiggyConnectionStatus.EXPIRED);
  assert.equal(markedStatus, SwiggyConnectionStatus.EXPIRED);
});

test("disconnect revokes the per-user Swiggy session before deleting the vault row", async () => {
  setReadyConfig();
  const sequence: string[] = [];
  const accessToken = "swiggy-user-token";
  model.findOne = () => ({
    lean: async () => ({ encryptedAccessToken: encryptSwiggyToken(accessToken) }),
  });
  (axios as any).post = async (url: string, body: unknown, options: any) => {
    sequence.push("remote");
    assert.equal(url, "https://mcp.swiggy.com/auth/logout");
    assert.equal(body, undefined);
    assert.equal(options.headers.Authorization, `Bearer ${accessToken}`);
    return { status: 204 };
  };
  model.deleteOne = async () => {
    sequence.push("local");
  };

  await new SwiggyConnectionService().disconnect("customer-1");
  assert.deepEqual(sequence, ["remote", "local"]);
});

test("disconnect treats an already-invalid Swiggy session as safely revoked", async () => {
  setReadyConfig();
  model.findOne = () => ({
    lean: async () => ({
      encryptedAccessToken: encryptSwiggyToken("already-invalid-token"),
    }),
  });
  let remoteAttempts = 0;
  (axios as any).post = async () => {
    remoteAttempts += 1;
    throw { response: { status: 419 } };
  };
  let deleted = false;
  model.deleteOne = async () => {
    deleted = true;
  };

  await new SwiggyConnectionService().disconnect("customer-1");
  assert.equal(remoteAttempts, 1);
  assert.equal(deleted, true);
});

test("disconnect retains the vault row when remote revocation is uncertain", async () => {
  setReadyConfig();
  model.findOne = () => ({
    lean: async () => ({ encryptedAccessToken: encryptSwiggyToken("live-token") }),
  });
  (axios as any).post = async () => {
    throw { response: { status: 503 } };
  };
  let deleted = false;
  model.deleteOne = async () => {
    deleted = true;
  };

  await assert.rejects(
    () => new SwiggyConnectionService().disconnect("customer-1"),
    /logout|revoke/i
  );
  assert.equal(deleted, false);
});

test("disconnect cannot delete a token created by a concurrent reconnect", async () => {
  setReadyConfig();
  const oldCiphertext = encryptSwiggyToken("old-token");
  const newCiphertext = encryptSwiggyToken("new-token");
  let storedCiphertext: string | null = oldCiphertext;
  model.findOne = () => ({
    lean: async () => ({ encryptedAccessToken: storedCiphertext }),
  });
  (axios as any).post = async () => {
    storedCiphertext = newCiphertext;
    return { status: 204 };
  };
  model.deleteOne = async (filter: any) => {
    if (
      filter.customerId === "customer-1" &&
      (!filter.encryptedAccessToken ||
        filter.encryptedAccessToken === storedCiphertext)
    ) {
      storedCiphertext = null;
    }
  };

  await new SwiggyConnectionService().disconnect("customer-1");
  assert.equal(storedCiphertext, newCiphertext);
});

test("disconnect refuses an unsafe MCP host without exposing or deleting the token", async () => {
  setReadyConfig();
  (EnvVars.values as any).SWIGGY_DINEOUT_ENABLED = "false";
  (EnvVars.values as any).SWIGGY_MCP_BASE = "https://attacker.invalid";
  model.findOne = () => ({
    lean: async () => ({ encryptedAccessToken: encryptSwiggyToken("live-token") }),
  });
  let remoteAttempts = 0;
  let deleted = false;
  (axios as any).post = async () => {
    remoteAttempts += 1;
    return { status: 204 };
  };
  model.deleteOne = async () => {
    deleted = true;
  };

  await assert.rejects(
    () => new SwiggyConnectionService().disconnect("customer-1"),
    /logout|revoke/i
  );
  assert.equal(remoteAttempts, 0);
  assert.equal(deleted, false);
});
