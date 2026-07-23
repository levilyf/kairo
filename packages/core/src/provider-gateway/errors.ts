/**
 * Provider Gateway errors.
 *
 * Attribute failures to gateway selection, policy, translation, or invocation.
 * Distinct from ContractError / RuntimeError / PolicyError.
 */

export enum ProviderGatewayErrorCode {
  PROVIDER_NOT_FOUND = "PROVIDER_NOT_FOUND",
  AMBIGUOUS_PROVIDER = "AMBIGUOUS_PROVIDER",
  INVALID_INVOCATION = "INVALID_INVOCATION",
  POLICY_DENIED = "POLICY_DENIED",
  CANCELLED = "CANCELLED",
  INVALID_RESPONSE = "INVALID_RESPONSE",
  INVOCATION_FAILED = "INVOCATION_FAILED",
  TRANSLATION_FAILED = "TRANSLATION_FAILED",
  /** Stream requested but provider cannot stream (capability or method). */
  STREAMING_UNSUPPORTED = "STREAMING_UNSUPPORTED",
}

export interface ProviderGatewayErrorOptions {
  code: ProviderGatewayErrorCode;
  message: string;
  providerId?: string;
  model?: string;
  sessionId?: string;
  turnId?: string;
  runtimeId?: string;
  field?: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class ProviderGatewayError extends Error {
  readonly code: ProviderGatewayErrorCode;
  readonly providerId?: string;
  readonly model?: string;
  readonly sessionId?: string;
  readonly turnId?: string;
  readonly runtimeId?: string;
  readonly field?: string;
  readonly details?: Record<string, unknown>;
  override readonly cause?: unknown;

  constructor(options: ProviderGatewayErrorOptions) {
    const parts = [
      options.runtimeId ? `runtime=${options.runtimeId}` : undefined,
      options.sessionId ? `session=${options.sessionId}` : undefined,
      options.turnId ? `turn=${options.turnId}` : undefined,
      options.providerId ? `provider=${options.providerId}` : undefined,
      options.model ? `model=${options.model}` : undefined,
      options.field ? `field=${options.field}` : undefined,
    ].filter(Boolean);

    const prefix = parts.length > 0 ? `[${parts.join(" ")}] ` : "";
    super(`${prefix}${options.message}`, { cause: options.cause });
    this.name = "ProviderGatewayError";
    this.code = options.code;
    if (options.providerId !== undefined) this.providerId = options.providerId;
    if (options.model !== undefined) this.model = options.model;
    if (options.sessionId !== undefined) this.sessionId = options.sessionId;
    if (options.turnId !== undefined) this.turnId = options.turnId;
    if (options.runtimeId !== undefined) this.runtimeId = options.runtimeId;
    if (options.field !== undefined) this.field = options.field;
    if (options.details !== undefined) this.details = options.details;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}
