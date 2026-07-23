/**
 * Runtime host errors.
 *
 * Distinct from ModuleError, HarnessError, ContractError, BindingError.
 * Attribute failures to runtime lifecycle / validation.
 */

export enum RuntimeErrorCode {
  INVALID_HARNESS = "INVALID_HARNESS",
  INVALID_STATE = "INVALID_STATE",
  INITIALIZATION_FAILED = "INITIALIZATION_FAILED",
  SHUTDOWN_FAILED = "SHUTDOWN_FAILED",
  CANCELLED = "CANCELLED",
}

export interface RuntimeErrorOptions {
  code: RuntimeErrorCode;
  message: string;
  runtimeId?: string;
  harnessName?: string;
  field?: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class RuntimeError extends Error {
  readonly code: RuntimeErrorCode;
  readonly runtimeId?: string;
  readonly harnessName?: string;
  readonly field?: string;
  readonly details?: Record<string, unknown>;
  override readonly cause?: unknown;

  constructor(options: RuntimeErrorOptions) {
    const parts = [
      options.runtimeId ? `runtime=${options.runtimeId}` : undefined,
      options.harnessName ? `harness=${options.harnessName}` : undefined,
      options.field ? `field=${options.field}` : undefined,
    ].filter(Boolean);

    const prefix = parts.length > 0 ? `[${parts.join(" ")}] ` : "";
    super(`${prefix}${options.message}`, { cause: options.cause });
    this.name = "RuntimeError";
    this.code = options.code;
    if (options.runtimeId !== undefined) this.runtimeId = options.runtimeId;
    if (options.harnessName !== undefined) {
      this.harnessName = options.harnessName;
    }
    if (options.field !== undefined) this.field = options.field;
    if (options.details !== undefined) this.details = options.details;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}
