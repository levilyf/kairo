/**
 * Agent Loop errors.
 *
 * Attribute failures to loop orchestration: options, cancellation,
 * iteration limits, provider/tool boundary failures, assembly failures.
 * Distinct from gateway/router/runtime errors (those may appear as cause).
 */

export enum AgentLoopErrorCode {
  INVALID_OPTIONS = "INVALID_OPTIONS",
  INVALID_TURN = "INVALID_TURN",
  CANCELLED = "CANCELLED",
  MAX_ITERATIONS = "MAX_ITERATIONS",
  ASSEMBLY_FAILED = "ASSEMBLY_FAILED",
  PROVIDER_FAILED = "PROVIDER_FAILED",
  TOOL_FAILED = "TOOL_FAILED",
  EXECUTION_FAILED = "EXECUTION_FAILED",
}

export interface AgentLoopErrorOptions {
  code: AgentLoopErrorCode;
  message: string;
  turnId?: string;
  sessionId?: string;
  runtimeId?: string;
  iteration?: number;
  field?: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class AgentLoopError extends Error {
  readonly code: AgentLoopErrorCode;
  readonly turnId?: string;
  readonly sessionId?: string;
  readonly runtimeId?: string;
  readonly iteration?: number;
  readonly field?: string;
  readonly details?: Record<string, unknown>;
  override readonly cause?: unknown;

  constructor(options: AgentLoopErrorOptions) {
    const parts = [
      options.runtimeId ? `runtime=${options.runtimeId}` : undefined,
      options.sessionId ? `session=${options.sessionId}` : undefined,
      options.turnId ? `turn=${options.turnId}` : undefined,
      options.iteration !== undefined
        ? `iteration=${options.iteration}`
        : undefined,
      options.field ? `field=${options.field}` : undefined,
    ].filter(Boolean);

    const prefix = parts.length > 0 ? `[${parts.join(" ")}] ` : "";
    super(`${prefix}${options.message}`, { cause: options.cause });
    this.name = "AgentLoopError";
    this.code = options.code;
    if (options.turnId !== undefined) this.turnId = options.turnId;
    if (options.sessionId !== undefined) this.sessionId = options.sessionId;
    if (options.runtimeId !== undefined) this.runtimeId = options.runtimeId;
    if (options.iteration !== undefined) this.iteration = options.iteration;
    if (options.field !== undefined) this.field = options.field;
    if (options.details !== undefined) this.details = options.details;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}
