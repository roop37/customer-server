import { logger } from "../../../log/logger";

export type DineoutAuditInput = {
  sessionId: string;
  tool: string;
  status: string;
  latencyMs: number;
  outcome: string;
  rateLimit?: {
    limit?: number;
    remaining?: number;
    reset?: number;
  };
  deprecationDetected?: boolean;
};

/**
 * Build a structured, PII-free audit record for a Swiggy tool call.
 * Supports Swiggy's audit rights (keyed by session_id) WITHOUT storing any
 * request/response body, token, or user PII. Keep this record allowlisted:
 * only operational fields, never arguments/responses.
 */
export const buildDineoutAuditRecord = (
  input: DineoutAuditInput
): Record<string, unknown> => {
  const record: Record<string, unknown> = {
    area: "swiggy_dineout",
    sessionId: input.sessionId,
    tool: input.tool,
    status: input.status,
    latencyMs: input.latencyMs,
    outcome: input.outcome,
  };
  if (input.rateLimit?.limit !== undefined) {
    record.rateLimitLimit = input.rateLimit.limit;
  }
  if (input.rateLimit?.remaining !== undefined) {
    record.rateLimitRemaining = input.rateLimit.remaining;
  }
  if (input.rateLimit?.reset !== undefined) {
    record.rateLimitReset = input.rateLimit.reset;
  }
  if (input.deprecationDetected !== undefined) {
    record.deprecationDetected = input.deprecationDetected;
  }
  return record;
};

export const logDineoutCall = (input: DineoutAuditInput): void => {
  // This service's Winston formatter interpolates `message` as a string;
  // passing an object directly collapses to "[object Object]" and destroys
  // the fields operators need during an incident.
  logger.info(JSON.stringify(buildDineoutAuditRecord(input)));
};
