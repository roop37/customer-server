import { EnvVars } from "../../utils/environment";

/**
 * Swiggy Dineout feature-flag + config reader. `isSwiggyDineoutReady()` is
 * the shared kill-switch/config gate used by OAuth, GraphQL, and tool paths.
 */
export type SwiggyDineoutConfig = {
  enabled: boolean;
  clientId?: string;
  redirectUri?: string;
  frontendReturn?: string;
  mcpBase: string;
};

export const SWIGGY_DINEOUT_DISABLED_MESSAGE =
  "Swiggy Dineout is currently unavailable.";

type SwiggyDineoutReadinessInput = {
  enabled?: string;
  clientId?: string;
  redirectUri?: string;
  frontendReturn?: string;
  tokenKey?: string;
  mcpBase?: string;
  serverEnv?: string;
};

const parseAbsoluteUrl = (value?: string): URL | null => {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash) return null;
    return url;
  } catch {
    return null;
  }
};

const isLocalHttpUrl = (url: URL): boolean =>
  url.protocol === "http:" &&
  ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);

const isTransportSafeUrl = (url: URL, production: boolean): boolean =>
  url.protocol === "https:" || (!production && isLocalHttpUrl(url));

/**
 * Access tokens may only ever be sent to Swiggy's documented MCP origin.
 * Keep this stricter than the generic transport check: a kill switch must not
 * turn disconnect into an SSRF/token-exfiltration path through a bad env var.
 */
export const isSafeSwiggyMcpBase = (value?: string): boolean => {
  const url = parseAbsoluteUrl(value);
  const allowedHosts = new Set([
    "mcp.swiggy.com",
    "mcp-staging.swiggy.com",
  ]);
  return Boolean(
    url &&
      url.protocol === "https:" &&
      allowedHosts.has(url.hostname) &&
      url.port === "" &&
      (url.pathname === "/" || url.pathname === "") &&
      url.search === ""
  );
};

// Pure predicate (kept separate so it is unit-testable without global env).
export const computeSwiggyDineoutReady = (
  input: SwiggyDineoutReadinessInput
): boolean => {
  if (input.enabled !== "true") return false;
  if (!input.clientId?.trim()) return false;
  if (!/^[0-9a-fA-F]{64}$/.test(input.tokenKey ?? "")) return false;

  const production = input.serverEnv === "production";
  const redirect = parseAbsoluteUrl(input.redirectUri);
  if (!redirect || !isTransportSafeUrl(redirect, production)) return false;
  if (
    production &&
    (redirect.pathname !== "/auth/swiggy/callback" ||
      redirect.search.length > 0)
  ) {
    return false;
  }

  // Cross-host production callbacks must have an explicit, HTTPS frontend
  // destination. Local development may keep the same-host `/dineout` fallback.
  if (production || input.frontendReturn) {
    const frontendReturn = parseAbsoluteUrl(input.frontendReturn);
    if (
      !frontendReturn ||
      !isTransportSafeUrl(frontendReturn, production)
    ) {
      return false;
    }
  }

  if (input.mcpBase) {
    if (!isSafeSwiggyMcpBase(input.mcpBase)) return false;
  }
  return true;
};

export const swiggyDineoutConfig = (): SwiggyDineoutConfig => ({
  enabled: EnvVars.values.SWIGGY_DINEOUT_ENABLED === "true",
  clientId: EnvVars.values.SWIGGY_CLIENT_ID,
  redirectUri: EnvVars.values.SWIGGY_OAUTH_REDIRECT_URI,
  frontendReturn: EnvVars.values.SWIGGY_FRONTEND_RETURN,
  mcpBase: EnvVars.values.SWIGGY_MCP_BASE,
});

export const isSwiggyDineoutReady = (): boolean =>
  computeSwiggyDineoutReady({
    enabled: EnvVars.values.SWIGGY_DINEOUT_ENABLED,
    clientId: EnvVars.values.SWIGGY_CLIENT_ID,
    redirectUri: EnvVars.values.SWIGGY_OAUTH_REDIRECT_URI,
    frontendReturn: EnvVars.values.SWIGGY_FRONTEND_RETURN,
    tokenKey: EnvVars.values.SWIGGY_TOKEN_ENCRYPTION_KEY,
    mcpBase: EnvVars.values.SWIGGY_MCP_BASE,
    serverEnv: EnvVars.values.SERVER_ENV,
  });
