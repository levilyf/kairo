/**
 * Module system errors.
 *
 * Errors are first-class and attributed to module id + lifecycle phase
 * per docs/MODULES.md and docs/CONTRACTS.md.
 */

export type ModuleLifecyclePhase =
  | "discovery"
  | "registration"
  | "resolution"
  | "load"
  | "initialization"
  | "start"
  | "stop"
  | "unload"
  | "runtime";

export enum ModuleErrorCode {
  DISCOVERY_FAILED = "DISCOVERY_FAILED",
  DUPLICATE_MODULE = "DUPLICATE_MODULE",
  DUPLICATE_CONTRIBUTION = "DUPLICATE_CONTRIBUTION",
  REGISTRATION_CLOSED = "REGISTRATION_CLOSED",
  INVALID_MANIFEST = "INVALID_MANIFEST",
  MISSING_DEPENDENCY = "MISSING_DEPENDENCY",
  MISSING_CAPABILITY = "MISSING_CAPABILITY",
  CIRCULAR_DEPENDENCY = "CIRCULAR_DEPENDENCY",
  VERSION_MISMATCH = "VERSION_MISMATCH",
  CORE_INCOMPATIBLE = "CORE_INCOMPATIBLE",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  RESOLUTION_FAILED = "RESOLUTION_FAILED",
  LOAD_FAILED = "LOAD_FAILED",
  INITIALIZATION_FAILED = "INITIALIZATION_FAILED",
  START_FAILED = "START_FAILED",
  STOP_FAILED = "STOP_FAILED",
  UNLOAD_FAILED = "UNLOAD_FAILED",
  UNKNOWN_MODULE = "UNKNOWN_MODULE",
  INVALID_STATE = "INVALID_STATE",
}

export interface ModuleErrorOptions {
  code: ModuleErrorCode;
  message: string;
  phase: ModuleLifecyclePhase;
  moduleId?: string;
  cause?: unknown;
  details?: Record<string, unknown>;
}

export class ModuleError extends Error {
  readonly code: ModuleErrorCode;
  readonly phase: ModuleLifecyclePhase;
  readonly moduleId?: string;
  readonly details?: Record<string, unknown>;
  override readonly cause?: unknown;

  constructor(options: ModuleErrorOptions) {
    const prefix = options.moduleId
      ? `[${options.phase}] ${options.moduleId}: `
      : `[${options.phase}] `;
    super(`${prefix}${options.message}`, {
      cause: options.cause,
    });
    this.name = "ModuleError";
    this.code = options.code;
    this.phase = options.phase;
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
