/**
 * Dedicated errors for @kairo/config.
 */

export const ConfigErrorCode = {
  PROJECT_NOT_FOUND: "PROJECT_NOT_FOUND",
  CONFIG_NOT_FOUND: "CONFIG_NOT_FOUND",
  INVALID_CONFIG: "INVALID_CONFIG",
  INVALID_SCHEMA: "INVALID_SCHEMA",
  ENVIRONMENT_VARIABLE_MISSING: "ENVIRONMENT_VARIABLE_MISSING",
  CONFIG_PARSE_FAILED: "CONFIG_PARSE_FAILED",
} as const;

export type ConfigErrorCode =
  (typeof ConfigErrorCode)[keyof typeof ConfigErrorCode];

export interface ConfigErrorOptions {
  readonly code: ConfigErrorCode;
  readonly message: string;
  readonly path?: string;
  readonly field?: string;
  readonly variable?: string;
  readonly cause?: unknown;
}

export class ConfigError extends Error {
  readonly code: ConfigErrorCode;
  readonly path?: string;
  readonly field?: string;
  readonly variable?: string;
  override readonly cause?: unknown;

  constructor(options: ConfigErrorOptions) {
    super(
      options.message,
      options.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = "ConfigError";
    this.code = options.code;
    if (options.path !== undefined) {
      this.path = options.path;
    }
    if (options.field !== undefined) {
      this.field = options.field;
    }
    if (options.variable !== undefined) {
      this.variable = options.variable;
    }
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}
