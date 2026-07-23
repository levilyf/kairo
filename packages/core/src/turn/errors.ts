/**
 * Turn system errors.
 *
 * Distinct from session/runtime/module/etc errors. Attribute failures to turn
 * lifecycle operations.
 */

export enum TurnErrorCode {
  INVALID_TURN = "INVALID_TURN",
  DUPLICATE_TURN = "DUPLICATE_TURN",
  NOT_FOUND = "NOT_FOUND",
  INVALID_STATE = "INVALID_STATE",
  MANAGER_CLOSED = "MANAGER_CLOSED",
  CREATION_FAILED = "CREATION_FAILED",
  COMPLETE_FAILED = "COMPLETE_FAILED",
  CANCEL_FAILED = "CANCEL_FAILED",
}

export interface TurnErrorOptions {
  code: TurnErrorCode;
  message: string;
  turnId?: string;
  sessionId?: string;
  runtimeId?: string;
  field?: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class TurnError extends Error {
  readonly code: TurnErrorCode;
  readonly turnId?: string;
  readonly sessionId?: string;
  readonly runtimeId?: string;
  readonly field?: string;
  readonly details?: Record<string, unknown>;
  override readonly cause?: unknown;

  constructor(options: TurnErrorOptions) {
    const parts = [
      options.runtimeId ? `runtime=${options.runtimeId}` : undefined,
      options.sessionId ? `session=${options.sessionId}` : undefined,
      options.turnId ? `turn=${options.turnId}` : undefined,
      options.field ? `field=${options.field}` : undefined,
    ].filter(Boolean);

    const prefix = parts.length > 0 ? `[${parts.join(" ")}] ` : "";
    super(`${prefix}${options.message}`, { cause: options.cause });
    this.name = "TurnError";
    this.code = options.code;
    if (options.turnId !== undefined) this.turnId = options.turnId;
    if (options.sessionId !== undefined) this.sessionId = options.sessionId;
    if (options.runtimeId !== undefined) this.runtimeId = options.runtimeId;
    if (options.field !== undefined) this.field = options.field;
    if (options.details !== undefined) this.details = options.details;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}
