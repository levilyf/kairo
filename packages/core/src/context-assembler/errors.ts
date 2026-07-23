/**
 * Context Assembler errors.
 *
 * Distinct from ContextError / ContextBuilderError. Attribute failures to
 * assembly orchestration and merge operations.
 */

export enum ContextAssemblerErrorCode {
  INVALID_OPTIONS = "INVALID_OPTIONS",
  BUILDER_FAILED = "BUILDER_FAILED",
  INVALID_FRAGMENT = "INVALID_FRAGMENT",
  ASSEMBLY_FAILED = "ASSEMBLY_FAILED",
}

export interface ContextAssemblerErrorOptions {
  code: ContextAssemblerErrorCode;
  message: string;
  builderId?: string;
  turnId?: string;
  sessionId?: string;
  runtimeId?: string;
  field?: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class ContextAssemblerError extends Error {
  readonly code: ContextAssemblerErrorCode;
  readonly builderId?: string;
  readonly turnId?: string;
  readonly sessionId?: string;
  readonly runtimeId?: string;
  readonly field?: string;
  readonly details?: Record<string, unknown>;
  override readonly cause?: unknown;

  constructor(options: ContextAssemblerErrorOptions) {
    const parts = [
      options.runtimeId ? `runtime=${options.runtimeId}` : undefined,
      options.sessionId ? `session=${options.sessionId}` : undefined,
      options.turnId ? `turn=${options.turnId}` : undefined,
      options.builderId ? `builder=${options.builderId}` : undefined,
      options.field ? `field=${options.field}` : undefined,
    ].filter(Boolean);

    const prefix = parts.length > 0 ? `[${parts.join(" ")}] ` : "";
    super(`${prefix}${options.message}`, { cause: options.cause });
    this.name = "ContextAssemblerError";
    this.code = options.code;
    if (options.builderId !== undefined) this.builderId = options.builderId;
    if (options.turnId !== undefined) this.turnId = options.turnId;
    if (options.sessionId !== undefined) this.sessionId = options.sessionId;
    if (options.runtimeId !== undefined) this.runtimeId = options.runtimeId;
    if (options.field !== undefined) this.field = options.field;
    if (options.details !== undefined) this.details = options.details;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}
