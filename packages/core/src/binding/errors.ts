/**
 * Contribution binding errors.
 *
 * Attributed to module + contribution identity so harness boot failures
 * remain inspectable. Distinct from ModuleError / ContractError / HarnessError.
 */

import type { BindableContributionType } from "./contribution.js";

export enum BindingErrorCode {
  INVALID_CONTRIBUTION = "INVALID_CONTRIBUTION",
  DUPLICATE_CONTRIBUTION = "DUPLICATE_CONTRIBUTION",
  UNKNOWN_CONTRIBUTION_TYPE = "UNKNOWN_CONTRIBUTION_TYPE",
  REGISTRY_MISMATCH = "REGISTRY_MISMATCH",
  INVALID_STATE = "INVALID_STATE",
  BIND_FAILED = "BIND_FAILED",
}

export interface BindingErrorOptions {
  code: BindingErrorCode;
  message: string;
  moduleId?: string;
  contributionId?: string;
  contributionType?: BindableContributionType | string;
  capability?: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class BindingError extends Error {
  readonly code: BindingErrorCode;
  readonly moduleId?: string;
  readonly contributionId?: string;
  readonly contributionType?: BindableContributionType | string;
  readonly capability?: string;
  readonly details?: Record<string, unknown>;
  override readonly cause?: unknown;

  constructor(options: BindingErrorOptions) {
    const parts = [
      options.moduleId ? `module=${options.moduleId}` : undefined,
      options.contributionType
        ? `type=${options.contributionType}`
        : undefined,
      options.contributionId ? `id=${options.contributionId}` : undefined,
    ].filter(Boolean);

    super(
      parts.length > 0
        ? `[${parts.join(" ")}] ${options.message}`
        : options.message,
      { cause: options.cause },
    );
    this.name = "BindingError";
    this.code = options.code;
    if (options.moduleId !== undefined) this.moduleId = options.moduleId;
    if (options.contributionId !== undefined) {
      this.contributionId = options.contributionId;
    }
    if (options.contributionType !== undefined) {
      this.contributionType = options.contributionType;
    }
    if (options.capability !== undefined) this.capability = options.capability;
    if (options.details !== undefined) this.details = options.details;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}
