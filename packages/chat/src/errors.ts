/**
 * Chat package errors — fail closed, typed codes only.
 */

export enum ChatErrorCode {
  INVALID_OPTIONS = "INVALID_OPTIONS",
  SESSION_NOT_FOUND = "SESSION_NOT_FOUND",
  SESSION_CORRUPT = "SESSION_CORRUPT",
  SESSION_IO = "SESSION_IO",
  TURN_FAILED = "TURN_FAILED",
  CANCELLED = "CANCELLED",
  MODEL_REQUIRED = "MODEL_REQUIRED",
  EOF = "EOF",
}

export interface ChatErrorOptions {
  readonly code: ChatErrorCode;
  readonly message: string;
  readonly sessionId?: string;
  readonly field?: string;
  readonly cause?: unknown;
  readonly details?: Readonly<Record<string, unknown>>;
}

export class ChatError extends Error {
  readonly code: ChatErrorCode;
  declare readonly sessionId?: string;
  declare readonly field?: string;
  declare readonly cause?: unknown;
  declare readonly details?: Readonly<Record<string, unknown>>;

  constructor(options: ChatErrorOptions) {
    super(options.message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "ChatError";
    this.code = options.code;
    if (options.sessionId !== undefined) this.sessionId = options.sessionId;
    if (options.field !== undefined) this.field = options.field;
    if (options.cause !== undefined) this.cause = options.cause;
    if (options.details !== undefined) this.details = options.details;
  }
}
