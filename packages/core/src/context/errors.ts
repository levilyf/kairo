/**
 * Context system errors.
 *
 * Distinct from turn/session/runtime/etc errors. Attribute failures to
 * context object construction and ownership rules.
 */

export enum ContextErrorCode {
  INVALID_CONTEXT = "INVALID_CONTEXT",
  DUPLICATE_CONTEXT = "DUPLICATE_CONTEXT",
  NOT_FOUND = "NOT_FOUND",
  INVALID_STATE = "INVALID_STATE",
  CREATION_FAILED = "CREATION_FAILED",
}

export interface ContextErrorOptions {
  code: ContextErrorCode;
  message: string;
  contextId?: string;
  turnId?: string;
  sessionId?: string;
  runtimeId?: string;
  field?: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class ContextError extends Error {
  readonly code: ContextErrorCode;
  readonly contextId?: string;
  readonly turnId?: string;
  readonly sessionId?: string;
  readonly runtimeId?: string;
  readonly field?: string;
  readonly details?: Record<string, unknown>;
  override readonly cause?: unknown;

  constructor(options: ContextErrorOptions) {
    const parts = [
      options.runtimeId ? `runtime=${options.runtimeId}` : undefined,
      options.sessionId ? `session=${options.sessionId}` : undefined,
      options.turnId ? `turn=${options.turnId}` : undefined,
      options.contextId ? `context=${options.contextId}` : undefined,
      options.field ? `field=${options.field}` : undefined,
    ].filter(Boolean);

    const prefix = parts.length > 0 ? `[${parts.join(" ")}] ` : "";
    super(`${prefix}${options.message}`, { cause: options.cause });
    this.name = "ContextError";
    this.code = options.code;
    if (options.contextId !== undefined) this.contextId = options.contextId;
    if (options.turnId !== undefined) this.turnId = options.turnId;
    if (options.sessionId !== undefined) this.sessionId = options.sessionId;
    if (options.runtimeId !== undefined) this.runtimeId = options.runtimeId;
    if (options.field !== undefined) this.field = options.field;
    if (options.details !== undefined) this.details = options.details;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}
