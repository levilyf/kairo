/**
 * CLI-owned user-facing errors.
 *
 * The CLI is the only layer that decides exit codes and user-visible
 * diagnostic text. Failures bubbling up from @kairo/config and
 * @kairo/app are wrapped into CLIError with a stable, machine-readable
 * code so test assertions and future scripts can branch on `error.code`.
 *
 * Codes are deliberately mapped 1:1 with the milestone contract:
 *
 *   UNKNOWN_COMMAND          arg parsing yields no command, or rough input
 *   PROJECT_NOT_FOUND        no .kairo/ directory discoverable from cwd
 *   CONFIG_LOAD_FAILED       @kairo/config could not load/validate the file
 *   APPLICATION_BOOT_FAILED  @kairo/app bootstrap returned ApplicationError
 *   PROVIDER_ALREADY_EXISTS  `provider add` when provider is already configured
 *   PROVIDER_NOT_FOUND       `provider configure/remove/<provider>` named an unknown id
 *   USER_CANCELLED           user pressed Ctrl-C / chose Cancel in an interactive prompt
 *   MISSING_PROMPT           `kairo run` invoked without a prompt
 *   RUN_FAILED               `kairo run` execution failed (provider/tool/runtime)
 */

export const CLIErrorCode = {
  UNKNOWN_COMMAND: "UNKNOWN_COMMAND",
  PROJECT_NOT_FOUND: "PROJECT_NOT_FOUND",
  CONFIG_LOAD_FAILED: "CONFIG_LOAD_FAILED",
  APPLICATION_BOOT_FAILED: "APPLICATION_BOOT_FAILED",
  PROVIDER_ALREADY_EXISTS: "PROVIDER_ALREADY_EXISTS",
  PROVIDER_NOT_FOUND: "PROVIDER_NOT_FOUND",
  USER_CANCELLED: "USER_CANCELLED",
  MISSING_PROMPT: "MISSING_PROMPT",
  RUN_FAILED: "RUN_FAILED",
} as const;

export type CLIErrorCode = (typeof CLIErrorCode)[keyof typeof CLIErrorCode];

export interface CLIErrorOptions {
  readonly code: CLIErrorCode;
  readonly message: string;
  /** Hint shown after the error message ("Run: ..."). Optional. */
  readonly hint?: string;
  /** Process exit code (default varies by code). */
  readonly exitCode?: number;
  /** Original error from config/app, preserved for debugging. */
  readonly cause?: unknown;
}

/** Default exit codes per CLIErrorCode. */
const DEFAULT_EXIT_CODES: Record<CLIErrorCode, number> = {
  UNKNOWN_COMMAND: 2,
  PROJECT_NOT_FOUND: 3,
  CONFIG_LOAD_FAILED: 4,
  APPLICATION_BOOT_FAILED: 5,
  PROVIDER_ALREADY_EXISTS: 6,
  PROVIDER_NOT_FOUND: 7,
  USER_CANCELLED: 130,
  MISSING_PROMPT: 2,
  RUN_FAILED: 8,
};

export class CLIError extends Error {
  readonly code: CLIErrorCode;
  declare readonly hint?: string;
  readonly exitCode: number;
  declare readonly cause?: unknown;

  constructor(options: CLIErrorOptions) {
    super(
      options.message,
      options.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = "CLIError";
    this.code = options.code;
    if (options.hint !== undefined) this.hint = options.hint;
    this.exitCode = options.exitCode ?? DEFAULT_EXIT_CODES[options.code];
    if (options.cause !== undefined) this.cause = options.cause;
  }
}
