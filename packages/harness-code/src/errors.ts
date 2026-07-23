/**
 * Kairo Code harness errors.
 *
 * The harness owns Code-specific composition failures. Provider,
 * runtime, and loop failures surface from their own layers; the harness
 * wraps only what it is responsible for (lifecycle + run orchestration).
 */

export const HarnessCodeErrorCode = {
  INVALID_OPTIONS: "INVALID_OPTIONS",
  NOT_RUNNABLE: "NOT_RUNNABLE",
  RUN_FAILED: "RUN_FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type HarnessCodeErrorCode =
  (typeof HarnessCodeErrorCode)[keyof typeof HarnessCodeErrorCode];

export interface HarnessCodeErrorOptions {
  readonly code: HarnessCodeErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}

export class HarnessCodeError extends Error {
  readonly code: HarnessCodeErrorCode;
  declare readonly cause?: unknown;

  constructor(options: HarnessCodeErrorOptions) {
    super(
      options.message,
      options.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = "HarnessCodeError";
    this.code = options.code;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}
