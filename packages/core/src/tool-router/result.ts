/**
 * Tool Router invocation result.
 *
 * Provider-neutral: carries the args that were sent and the validated
 * ToolResult. No vendor-specific fields.
 */

import type { ToolResult } from "../contracts/tool.js";
import {
  ToolRouterError,
  ToolRouterErrorCode,
} from "./errors.js";

export interface ToolInvocation {
  readonly toolId: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly sessionId?: string;
  readonly turnId?: string;
  readonly runtimeId?: string;
  readonly signal?: AbortSignal;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ToolRouterResult {
  readonly toolId: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly result: ToolResult;
  readonly sessionId?: string;
  readonly turnId?: string;
  readonly runtimeId?: string;
}

/**
 * Validate a ToolResult at the router boundary.
 */
export function assertToolResult(
  value: unknown,
  attribution: {
    toolId?: string;
    sessionId?: string;
    turnId?: string;
    runtimeId?: string;
  } = {},
): asserts value is ToolResult {
  if (!isPlainObject(value)) {
    throw invalid("ToolResult must be an object", attribution);
  }
  if (typeof value.ok !== "boolean") {
    throw invalid("result.ok must be a boolean", attribution, "ok");
  }
  if (
    value.message !== undefined &&
    typeof value.message !== "string"
  ) {
    throw invalid("result.message must be a string when provided", attribution, "message");
  }
  if (
    value.errorCode !== undefined &&
    typeof value.errorCode !== "string"
  ) {
    throw invalid(
      "result.errorCode must be a string when provided",
      attribution,
      "errorCode",
    );
  }
  if (
    value.metadata !== undefined &&
    (typeof value.metadata !== "object" ||
      value.metadata === null ||
      Array.isArray(value.metadata))
  ) {
    throw invalid(
      "result.metadata must be an object when provided",
      attribution,
      "metadata",
    );
  }
}

function invalid(
  message: string,
  attribution: {
    toolId?: string;
    sessionId?: string;
    turnId?: string;
    runtimeId?: string;
  },
  field?: string,
): ToolRouterError {
  return new ToolRouterError({
    code: ToolRouterErrorCode.INVALID_RESULT,
    message,
    ...(attribution.toolId !== undefined ? { toolId: attribution.toolId } : {}),
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
