/**
 * Tool Router errors.
 *
 * Attribute failures to selection, policy, argument validation, or invocation.
 * Distinct from ContractError / RuntimeError / PolicyError.
 */

export enum ToolRouterErrorCode {
  TOOL_NOT_FOUND = "TOOL_NOT_FOUND",
  INVALID_INVOCATION = "INVALID_INVOCATION",
  INVALID_ARGUMENTS = "INVALID_ARGUMENTS",
  POLICY_DENIED = "POLICY_DENIED",
  CANCELLED = "CANCELLED",
  INVALID_RESULT = "INVALID_RESULT",
  INVOCATION_FAILED = "INVOCATION_FAILED",
}

export interface ToolRouterErrorOptions {
  code: ToolRouterErrorCode;
  message: string;
  toolId?: string;
  sessionId?: string;
  turnId?: string;
  runtimeId?: string;
  field?: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class ToolRouterError extends Error {
  readonly code: ToolRouterErrorCode;
  readonly toolId?: string;
  readonly sessionId?: string;
  readonly turnId?: string;
  readonly runtimeId?: string;
  readonly field?: string;
  readonly details?: Record<string, unknown>;
  override readonly cause?: unknown;

  constructor(options: ToolRouterErrorOptions) {
    const parts = [
      options.runtimeId ? `runtime=${options.runtimeId}` : undefined,
      options.sessionId ? `session=${options.sessionId}` : undefined,
      options.turnId ? `turn=${options.turnId}` : undefined,
      options.toolId ? `tool=${options.toolId}` : undefined,
      options.field ? `field=${options.field}` : undefined,
    ].filter(Boolean);

    const prefix = parts.length > 0 ? `[${parts.join(" ")}] ` : "";
    super(`${prefix}${options.message}`, { cause: options.cause });
    this.name = "ToolRouterError";
    this.code = options.code;
    if (options.toolId !== undefined) this.toolId = options.toolId;
    if (options.sessionId !== undefined) this.sessionId = options.sessionId;
    if (options.turnId !== undefined) this.turnId = options.turnId;
    if (options.runtimeId !== undefined) this.runtimeId = options.runtimeId;
    if (options.field !== undefined) this.field = options.field;
    if (options.details !== undefined) this.details = options.details;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}
