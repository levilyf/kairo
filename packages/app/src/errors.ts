/**
 * Dedicated errors for @kairo/app.
 *
 * The application layer wraps failures from provider registration, harness
 * construction, and runtime construction under `BOOTSTRAP_FAILED`, plus
 * this package's own lifecycle mistakes (`APPLICATION_ALREADY_STARTED`,
 * `APPLICATION_NOT_STARTED`). Underlying errors (ProviderRegistryError,
 * HarnessError, RuntimeError, BindingError, etc.) are preserved as the
 * `cause` chain.
 */

export const ApplicationErrorCode = {
  /** `start()` was called on an Application that has already been started. */
  APPLICATION_ALREADY_STARTED: "APPLICATION_ALREADY_STARTED",
  /** A state query or `stop()` was called before `start()`. */
  APPLICATION_NOT_STARTED: "APPLICATION_NOT_STARTED",
  /** `createApplication()` failed during one of its bootstrap steps. */
  BOOTSTRAP_FAILED: "BOOTSTRAP_FAILED",
  /** A built-in provider factory refused to register. */
  PROVIDER_REGISTRATION_FAILED: "PROVIDER_REGISTRATION_FAILED",
} as const;

export type ApplicationErrorCode =
  (typeof ApplicationErrorCode)[keyof typeof ApplicationErrorCode];

export interface ApplicationErrorOptions {
  readonly code: ApplicationErrorCode;
  readonly message: string;
  readonly phase?: BootstrapPhase;
  readonly providerId?: string;
  readonly cause?: unknown;
}

/** Phases executed (in order) during `createApplication()`. */
export const BootstrapPhase = {
  PROVIDER_REGISTER: "provider.register",
  PROVIDER_CONSTRUCT: "provider.construct",
  HARNESS_DEFINE: "harness.define",
  HARNESS_BUILD: "harness.build",
  RUNTIME_BUILD: "runtime.build",
} as const;

export type BootstrapPhase =
  (typeof BootstrapPhase)[keyof typeof BootstrapPhase];

export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode;
  declare readonly phase?: BootstrapPhase;
  declare readonly providerId?: string;
  declare readonly cause?: unknown;

  constructor(options: ApplicationErrorOptions) {
    super(
      options.message,
      options.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = "ApplicationError";
    this.code = options.code;
    if (options.phase !== undefined) this.phase = options.phase;
    if (options.providerId !== undefined) this.providerId = options.providerId;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}
