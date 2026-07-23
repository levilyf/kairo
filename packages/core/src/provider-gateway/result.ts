/**
 * Provider Gateway invocation result.
 *
 * Provider-neutral: carries the request that was sent and the validated
 * ProviderResponse. No vendor-specific fields.
 */

import type {
  ProviderRequest,
  ProviderResponse,
  ProviderStreamEvent,
} from "../contracts/provider.js";
import {
  ProviderGatewayError,
  ProviderGatewayErrorCode,
} from "./errors.js";

export interface ProviderInvocation {
  readonly providerId: string;
  readonly model: string;
  readonly sessionId: string;
  readonly turnId: string;
  readonly runtimeId: string;
  readonly contextId: string;
  readonly signal?: AbortSignal;
  readonly options?: Readonly<Record<string, unknown>>;
}

export interface ProviderGatewayResult {
  readonly providerId: string;
  readonly model: string;
  readonly request: ProviderRequest;
  readonly response: ProviderResponse;
  readonly sessionId: string;
  readonly turnId: string;
  readonly runtimeId: string;
  readonly contextId: string;
}

/**
 * One attributed stream event from ProviderGateway.stream().
 * Carries the provider-neutral event plus gateway attribution.
 */
export interface ProviderGatewayStreamEvent {
  readonly event: ProviderStreamEvent;
  readonly providerId: string;
  readonly model: string;
  readonly sessionId: string;
  readonly turnId: string;
  readonly runtimeId: string;
  readonly contextId: string;
  readonly request: ProviderRequest;
}

/**
 * Validate a ProviderResponse at the gateway boundary.
 */
export function assertProviderResponse(
  value: unknown,
  attribution: {
    providerId?: string;
    sessionId?: string;
    turnId?: string;
    runtimeId?: string;
  } = {},
): asserts value is ProviderResponse {
  if (!isPlainObject(value)) {
    throw invalid("ProviderResponse must be an object", attribution);
  }
  if (typeof value.id !== "string" || value.id.trim().length === 0) {
    throw invalid("response.id must be a non-empty string", attribution, "id");
  }
  if (!Array.isArray(value.output)) {
    throw invalid("response.output must be an array", attribution, "output");
  }
  if (typeof value.stopReason !== "string" || value.stopReason.trim().length === 0) {
    throw invalid(
      "response.stopReason must be a non-empty string",
      attribution,
      "stopReason",
    );
  }
}

function invalid(
  message: string,
  attribution: {
    providerId?: string;
    sessionId?: string;
    turnId?: string;
    runtimeId?: string;
  },
  field?: string,
): ProviderGatewayError {
  return new ProviderGatewayError({
    code: ProviderGatewayErrorCode.INVALID_RESPONSE,
    message,
    ...(attribution.providerId !== undefined
      ? { providerId: attribution.providerId }
      : {}),
    ...(attribution.sessionId !== undefined
      ? { sessionId: attribution.sessionId }
      : {}),
    ...(attribution.turnId !== undefined ? { turnId: attribution.turnId } : {}),
    ...(attribution.runtimeId !== undefined
      ? { runtimeId: attribution.runtimeId }
      : {}),
    ...(field !== undefined ? { field } : {}),
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
