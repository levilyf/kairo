/**
 * Context Builder system errors.
 *
 * Distinct from ContextError (object lifecycle) and ContractError
 * (provider/tool/command/ui). Attribute failures to builder contracts
 * and registry operations.
 */

export enum ContextBuilderErrorCode {
  INVALID_BUILDER = "INVALID_BUILDER",
  INVALID_RESULT = "INVALID_RESULT",
  DUPLICATE_BUILDER = "DUPLICATE_BUILDER",
  NOT_FOUND = "NOT_FOUND",
  REGISTRY_CLOSED = "REGISTRY_CLOSED",
  BUILD_FAILED = "BUILD_FAILED",
}

export interface ContextBuilderErrorOptions {
  code: ContextBuilderErrorCode;
  message: string;
  builderId?: string;
  field?: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class ContextBuilderError extends Error {
  readonly code: ContextBuilderErrorCode;
  readonly builderId?: string;
  readonly field?: string;
  readonly details?: Record<string, unknown>;
  override readonly cause?: unknown;

  constructor(options: ContextBuilderErrorOptions) {
    const parts = [
      options.builderId ? `builder=${options.builderId}` : undefined,
      options.field ? `field=${options.field}` : undefined,
    ].filter(Boolean);

    const prefix = parts.length > 0 ? `[${parts.join(" ")}] ` : "";
    super(`${prefix}${options.message}`, { cause: options.cause });
    this.name = "ContextBuilderError";
    this.code = options.code;
    if (options.builderId !== undefined) this.builderId = options.builderId;
    if (options.field !== undefined) this.field = options.field;
    if (options.details !== undefined) this.details = options.details;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}
