/**
 * Harness composition errors.
 *
 * Distinct from ModuleError: these attribute failures to harness definition,
 * validation, or composition/boot orchestration — not module lifecycle internals.
 */

export enum HarnessErrorCode {
  INVALID_DEFINITION = "INVALID_DEFINITION",
  DUPLICATE_MODULE = "DUPLICATE_MODULE",
  INVALID_PERMISSIONS = "INVALID_PERMISSIONS",
  INVALID_CONFIG = "INVALID_CONFIG",
  INVALID_ENVIRONMENT = "INVALID_ENVIRONMENT",
  INVALID_MODULE_ENTRY = "INVALID_MODULE_ENTRY",
  BOOT_FAILED = "BOOT_FAILED",
  INVALID_STATE = "INVALID_STATE",
}

export interface HarnessErrorOptions {
  code: HarnessErrorCode;
  message: string;
  harnessName?: string;
  field?: string;
  moduleId?: string;
  cause?: unknown;
  details?: Record<string, unknown>;
}

export class HarnessError extends Error {
  readonly code: HarnessErrorCode;
  readonly harnessName?: string;
  readonly field?: string;
  readonly moduleId?: string;
  readonly details?: Record<string, unknown>;
  override readonly cause?: unknown;

  constructor(options: HarnessErrorOptions) {
    const parts = [
      options.harnessName ? `harness=${options.harnessName}` : undefined,
      options.field ? `field=${options.field}` : undefined,
      options.moduleId ? `module=${options.moduleId}` : undefined,
    ].filter(Boolean);

    const prefix = parts.length > 0 ? `[${parts.join(" ")}] ` : "";
    super(`${prefix}${options.message}`, { cause: options.cause });
    this.name = "HarnessError";
    this.code = options.code;
    if (options.harnessName !== undefined) {
      this.harnessName = options.harnessName;
    }
    if (options.field !== undefined) {
      this.field = options.field;
    }
    if (options.moduleId !== undefined) {
      this.moduleId = options.moduleId;
    }
    if (options.details !== undefined) {
      this.details = options.details;
    }
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}
