/**
 * OpenAI provider errors — vendor failures mapped to package-local terms.
 * Core maps Provider failures at the gateway boundary; this package owns
 * SDK/auth/mapping attribution before throwing.
 */

export const ProtocolOpenAIErrorCode = {
  INVALID_CONFIG: "INVALID_CONFIG",
  INVALID_REQUEST: "INVALID_REQUEST",
  AUTHENTICATION: "AUTHENTICATION",
  RATE_LIMITED: "RATE_LIMITED",
  API_ERROR: "API_ERROR",
  CANCELLED: "CANCELLED",
  MAPPING_FAILED: "MAPPING_FAILED",
  UNEXPECTED_RESPONSE: "UNEXPECTED_RESPONSE",
} as const;

export type ProtocolOpenAIErrorCode =
  (typeof ProtocolOpenAIErrorCode)[keyof typeof ProtocolOpenAIErrorCode];

export interface ProtocolOpenAIErrorOptions {
  readonly code: ProtocolOpenAIErrorCode;
  readonly message: string;
  readonly field?: string;
  readonly status?: number;
  readonly providerId?: string;
  readonly model?: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly cause?: unknown;
}

export class ProtocolOpenAIError extends Error {
  readonly code: ProtocolOpenAIErrorCode;
  readonly field?: string;
  readonly status?: number;
  readonly providerId?: string;
  readonly model?: string;
  readonly details?: Readonly<Record<string, unknown>>;
  override readonly cause?: unknown;

  constructor(options: ProtocolOpenAIErrorOptions) {
    super(
      options.message,
      options.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = "ProtocolOpenAIError";
    this.code = options.code;
    if (options.field !== undefined) {
      this.field = options.field;
    }
    if (options.status !== undefined) {
      this.status = options.status;
    }
    if (options.providerId !== undefined) {
      this.providerId = options.providerId;
    }
    if (options.model !== undefined) {
      this.model = options.model;
    }
    if (options.details !== undefined) {
      this.details = options.details;
    }
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

/**
 * Build error options without assigning explicit undefined under
 * exactOptionalPropertyTypes. Input fields may be `T | undefined`.
 */
export function errorOptions(base: {
  code: ProtocolOpenAIErrorCode;
  message: string;
  field?: string | undefined;
  status?: number | undefined;
  providerId?: string | undefined;
  model?: string | undefined;
  details?: Readonly<Record<string, unknown>> | undefined;
  cause?: unknown;
}): ProtocolOpenAIErrorOptions {
  return {
    code: base.code,
    message: base.message,
    ...(base.field !== undefined ? { field: base.field } : {}),
    ...(base.status !== undefined ? { status: base.status } : {}),
    ...(base.providerId !== undefined ? { providerId: base.providerId } : {}),
    ...(base.model !== undefined ? { model: base.model } : {}),
    ...(base.details !== undefined ? { details: base.details } : {}),
    ...(base.cause !== undefined ? { cause: base.cause } : {}),
  };
}
