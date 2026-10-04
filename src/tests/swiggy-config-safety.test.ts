import assert from "assert/strict";
import test from "node:test";
import { computeSwiggyDineoutReady } from "../modules/dineout/config";

const validConfig = {
  enabled: "true",
  clientId: "hoizr-client",
  redirectUri: "https://orderapi.hoizr.com/auth/swiggy/callback",
  frontendReturn: "https://hoizr.com/me/profile",
  tokenKey: "a".repeat(64),
  serverEnv: "production",
};

test("readiness rejects an encryption key that is not exactly 32 bytes of hex", () => {
  assert.equal(
    computeSwiggyDineoutReady({ ...validConfig, tokenKey: "a".repeat(63) } as any),
    false
  );
  assert.equal(
    computeSwiggyDineoutReady({ ...validConfig, tokenKey: "z".repeat(64) } as any),
    false
  );
});

test("production readiness rejects non-HTTPS OAuth callback URLs", () => {
  assert.equal(
    computeSwiggyDineoutReady({
      ...validConfig,
      redirectUri: "http://orderapi.hoizr.com/auth/swiggy/callback",
    } as any),
    false
  );
});

test("production readiness rejects missing, relative, and non-HTTPS frontend return URLs", () => {
  for (const frontendReturn of [
    undefined,
    "/me/profile",
    "http://hoizr.com/me/profile",
  ]) {
    assert.equal(
      computeSwiggyDineoutReady({ ...validConfig, frontendReturn } as any),
      false
    );
  }
});

test("production readiness accepts complete HTTPS callback and return URLs", () => {
  assert.equal(computeSwiggyDineoutReady(validConfig as any), true);
});

test("readiness accepts only Swiggy's documented production and staging MCP origins", () => {
  for (const mcpBase of [
    "https://mcp.swiggy.com",
    "https://mcp-staging.swiggy.com",
  ]) {
    assert.equal(
      computeSwiggyDineoutReady({ ...validConfig, mcpBase } as any),
      true
    );
  }
});

test("production readiness rejects a non-Swiggy or path-qualified MCP base", () => {
  for (const mcpBase of [
    "https://attacker.invalid",
    "https://mcp.swiggy.com/forward",
    "https://mcp.swiggy.com?redirect=https://attacker.invalid",
  ]) {
    assert.equal(
      computeSwiggyDineoutReady({ ...validConfig, mcpBase } as any),
      false
    );
  }
});
