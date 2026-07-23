/**
 * Policy system errors.
 *
 * Distinct from RuntimeError, ModuleError, HarnessError, ContractError,
 * BindingError, EventError. Attribute failures to policy evaluation.
 */

export enum PolicyErrorCode {
  INVALID_HOOK = "INVALID_HOOK",
  DUPLICATE_HOOK = "DUPLICATE_HOOK",
  EVALUATION_FAILED = "EVALUATION_FAILED",
  HOOK_ERROR = "HOOK_ERROR",
  MANAGER_CLOSED = "MANAGER_CLOSED",
}

export interface PolicyErrorOptions {
  code: PolicyErrorCode;
  message: string;
  hookId?: string;
  action?: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class PolicyError extends Error {
  readonly code: PolicyErrorCode;
  readonly hookId?: string;
  readonly action?: string;
  readonly details?: Record<string, unknown>;
  override readonly cause?: unknown;

  constructor(options: PolicyErrorOptions) {
    const parts = [
      options.hookId ? `hook=${options.hookId}` : undefined,
      options.action ? `action=${options.action}` : undefined,
    ].filter(Boolean);

    const prefix = parts.length > 0 ? `[${parts.join(" ")}] ` : "";
    super(`${prefix}${options.message}`, { cause: options.cause });
    this.name = "PolicyError";
    this.code = options.code;
    if (options.hookId !== undefined) this.hookId = options.hookId;
    if (options.action !== undefined) this.action = options.action;
    if (options.details !== undefined) this.details = options.details;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}
