/**
 * Session system errors.
 *
 * Distinct from RuntimeError, ModuleError, HarnessError, ContractError,
 * BindingError, EventError, and PolicyError. Attribute failures to session
 * lifecycle operations.
 */

export enum SessionErrorCode {
  INVALID_SESSION = "INVALID_SESSION",
  DUPLICATE_SESSION = "DUPLICATE_SESSION",
  NOT_FOUND = "NOT_FOUND",
  INVALID_STATE = "INVALID_STATE",
  MANAGER_CLOSED = "MANAGER_CLOSED",
  CREATION_FAILED = "CREATION_FAILED",
  CLOSE_FAILED = "CLOSE_FAILED",
}

export interface SessionErrorOptions {
  code: SessionErrorCode;
  message: string;
  sessionId?: string;
  runtimeId?: string;
  field?: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class SessionError extends Error {
  readonly code: SessionErrorCode;
  readonly sessionId?: string;
  readonly runtimeId?: string;
  readonly field?: string;
  readonly details?: Record<string, unknown>;
  override readonly cause?: unknown;

  constructor(options: SessionErrorOptions) {
    const parts = [
      options.runtimeId ? `runtime=${options.runtimeId}` : undefined,
      options.sessionId ? `session=${options.sessionId}` : undefined,
      options.field ? `field=${options.field}` : undefined,
    ].filter(Boolean);

    const prefix = parts.length > 0 ? `[${parts.join(" ")}] ` : "";
    super(`${prefix}${options.message}`, { cause: options.cause });
    this.name = "SessionError";
    this.code = options.code;
    if (options.sessionId !== undefined) this.sessionId = options.sessionId;
    if (options.runtimeId !== undefined) this.runtimeId = options.runtimeId;
    if (options.field !== undefined) this.field = options.field;
    if (options.details !== undefined) this.details = options.details;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}
